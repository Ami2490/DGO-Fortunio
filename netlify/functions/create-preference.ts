import type { Handler } from "@netlify/functions";
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { doc, getDoc } from "firebase/firestore";
import { db } from "./utils/firebase";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo No Permitido' };
  }

  // 1. Obtener Configuración de Firestore
  let siteConfig: any = null;
  try {
    const configSnap = await getDoc(doc(db, 'config', 'siteConfig'));
    if (configSnap.exists()) {
      siteConfig = configSnap.data();
    }
  } catch (err) {
    console.error("Error al leer config de Firestore:", err);
  }

  // 2. Priorizar tokens del panel, sino usar variables de entorno
  const MP_ACCESS_TOKEN = siteConfig?.paymentCredentials?.mercadopago?.accessToken || process.env.MP_ACCESS_TOKEN;

  // 3. Determinar la URL base dinámica para Webhooks y Retorno
  const host = event.headers.host || 'distribuidoradgo.netlify.app';
  const protocol = event.headers['x-forwarded-proto'] || 'https';
  const detectedUrl = `${protocol}://${host}`;
  const SITE_URL = siteConfig?.siteUrl || siteConfig?.paymentCredentials?.mercadopago?.siteUrl || detectedUrl;
  const APP_URL = SITE_URL.replace(/\/$/, '');

  if (!MP_ACCESS_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "No se encontro el Token de Mercado Pago. Configuralo en el Panel de Administrador." }) };
  }

  try {
    const { orderId, items, customerEmail, total } = JSON.parse(event.body || '{}');

    if (!orderId || !items || !items.length) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos obligatorios (orderId, items)" }) };
    }

    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: items.map((item: any) => ({
          id: item.productId,
          title: item.name,
          unit_price: Number(item.price),
          quantity: Number(item.quantity),
          currency_id: 'ARS',
          picture_url: item.image
        })),
        payer: {
          email: customerEmail,
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
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: result.id, init_point: result.init_point })
    };

  } catch (error: any) {
    console.error("Error creating preference:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
