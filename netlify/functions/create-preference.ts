import type { Handler } from "@netlify/functions";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { adminDb } from "./utils/firebase-admin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo No Permitido' };
  }

  try {
    const { orderId, items, customerEmail, total } = JSON.parse(event.body || '{}');

    if (!orderId || !items || !items.length) {
      return { 
        statusCode: 400, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Faltan datos obligatorios (orderId, items)" }) 
      };
    }

    // 1. Obtener Configuración de Firestore usando Admin SDK
    let siteConfig: any = null;
    try {
      const configDoc = await adminDb.collection('config').doc('siteConfig').get();
      if (configDoc.exists) {
        siteConfig = configDoc.data();
      }
    } catch (err) {
      console.error("Error al leer config de Firestore con Admin SDK:", err);
    }

    // 2. Credenciales
    const MP_ACCESS_TOKEN = siteConfig?.paymentCredentials?.mercadopago?.accessToken || process.env.MP_ACCESS_TOKEN;

    if (!MP_ACCESS_TOKEN) {
      return { 
        statusCode: 500, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No hay Token de Mercado Pago. Configuralo en el Panel." }) 
      };
    }

    // 3. URLs
    const host = event.headers.host || 'distribuidoradgo.netlify.app';
    const protocol = event.headers['x-forwarded-proto'] || 'https';
    const detectedUrl = `${protocol}://${host}`;
    const SITE_URL = siteConfig?.siteUrl || detectedUrl;
    const APP_URL = SITE_URL.replace(/\/$/, '');

    // 4. Mercado Pago Preference
    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    const preferenceData = {
      body: {
        items: items.map((item: any) => ({
          id: String(item.productId),
          title: item.name,
          unit_price: Number(item.price),
          quantity: Number(item.quantity),
          currency_id: 'ARS',
          picture_url: item.image
        })),
        payer: {
          email: customerEmail || 'invitado@temp.com',
        },
        external_reference: orderId,
        back_urls: {
          success: `${APP_URL}/?status=success&orderId=${orderId}`,
          failure: `${APP_URL}/?status=failure`,
          pending: `${APP_URL}/?status=pending`,
        },
        auto_return: 'approved',
        notification_url: `${APP_URL}/.netlify/functions/webhook`,
      }
    };

    const result = await preference.create(preferenceData);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        id: result.id, 
        init_point: result.init_point 
      })
    };

  } catch (error: any) {
    console.error("Error en create-preference:", error);
    return { 
      statusCode: 500, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: error.message || "Error interno al crear la preferencia",
        details: error.toString()
      }) 
    };
  }
};
