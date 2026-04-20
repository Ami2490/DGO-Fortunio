import type { Handler } from "@netlify/functions";
import { adminDb } from "./utils/firebase-admin";

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo No Permitido' };
  }

  try {
    const { orderId, total, customerEmail } = JSON.parse(event.body || '{}');

    if (!orderId || !total) {
      return { 
        statusCode: 400, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Faltan datos obligatorios (orderId, total)" }) 
      };
    }

    // 1. Obtener Configuración de Firestore con Admin SDK
    let siteConfig: any = null;
    try {
      const configDoc = await adminDb.collection('config').doc('siteConfig').get();
      if (configDoc.exists) {
        siteConfig = configDoc.data();
      }
    } catch (err) {
      console.error("Error al leer config con Admin SDK:", err);
    }

    // 2. Credenciales
    const UALA_ACCESS_TOKEN = siteConfig?.paymentCredentials?.ualabis?.accessToken || process.env.UALA_ACCESS_TOKEN;
    const UALA_USER_NAME = siteConfig?.paymentCredentials?.ualabis?.userName || process.env.UALA_USER_NAME;
    
    if (!UALA_ACCESS_TOKEN) {
      return { 
        statusCode: 500, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No se encontro el Token de Ualá Bis. Configuralo en el Panel." }) 
      };
    }

    // 3. URLs
    const host = event.headers.host || 'distribuidoradgo.netlify.app';
    const protocol = event.headers['x-forwarded-proto'] || 'https';
    const detectedUrl = `${protocol}://${host}`;
    const SITE_URL = siteConfig?.siteUrl || detectedUrl;
    const APP_URL = SITE_URL.replace(/\/$/, '');

    const ualaUser = UALA_USER_NAME || customerEmail || 'venta@dgo.com.ar';

    const response = await fetch('https://api.ualabis.com.ar/checkout/v1/checkout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${UALA_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Number(total),
        description: `Pedido DGO #${orderId.substring(0, 6).toUpperCase()}`,
        userName: ualaUser,
        orderId: orderId,
        callback_fail: `${APP_URL}/?status=failure`,
        callback_success: `${APP_URL}/?status=success&orderId=${orderId}`,
        notification_url: `${APP_URL}/.netlify/functions/webhook-uala`
      })
    });

    const rawResponse = await response.text();

    if (!response.ok) {
      console.error("Ualá Bis API Error:", rawResponse);
      return { 
        statusCode: response.status, 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Error en la pasarela Ualá Bis", details: rawResponse }) 
      };
    }

    const data = JSON.parse(rawResponse);
    
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        id: data.uuid, 
        checkout_url: data.checkout_url 
      })
    };

  } catch (error: any) {
    console.error("Error en create-ualabis-preference:", error);
    return { 
      statusCode: 500, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }) 
    };
  }
};
