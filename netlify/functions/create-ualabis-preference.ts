import type { Handler } from "@netlify/functions";
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
  const UALA_ACCESS_TOKEN = siteConfig?.paymentCredentials?.ualabis?.accessToken || process.env.UALA_ACCESS_TOKEN;
  const UALA_USER_NAME = siteConfig?.paymentCredentials?.ualabis?.userName || process.env.UALA_USER_NAME;
  const host = event.headers.host || 'distribuidoradgo.netlify.app';
  const protocol = event.headers['x-forwarded-proto'] || 'https';
  const detectedUrl = `${protocol}://${host}`;
  const SITE_URL_RAW = siteConfig?.siteUrl || siteConfig?.paymentCredentials?.mercadopago?.siteUrl || detectedUrl;
  const APP_URL = SITE_URL_RAW.replace(/\/$/, '');

  if (!UALA_ACCESS_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "No se encontro el Token de Ualá Bis. Configuralo en el Panel de Administrador." }) };
  }

  try {
    const { orderId, total, customerEmail } = JSON.parse(event.body || '{}');

    if (!orderId || !total) {
      return { statusCode: 400, body: JSON.stringify({ error: "Faltan datos obligatorios (orderId, total)" }) };
    }

    // El username para Ualá Bis suele ser el email de la cuenta de Ualá, 
    // pero en algunas versiones requieren el email del comprador o un campo fijo.
    // Usaremos UALA_USER_NAME del env si existe, sino el customerEmail.
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ualá Bis API Error:", errorText);
      return { statusCode: response.status, body: JSON.stringify({ error: "Error en la pasarela Ualá Bis" }) };
    }

    const data = await response.json();
    
    // Ualá Bis devuelve checkout_url y uuid
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        id: data.uuid, 
        checkout_url: data.checkout_url 
      })
    };

  } catch (error: any) {
    console.error("Error creating Ualá Bis preference:", error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
