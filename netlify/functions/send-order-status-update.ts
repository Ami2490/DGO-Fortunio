import type { Handler } from "@netlify/functions";
import { DB_PATHS } from './utils/firebase';
import { adminDb } from './utils/firebase-admin';
import nodemailer from 'nodemailer';
import { generateOrderEmailTemplate } from './utils/email-templates';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo No Permitido' };
  }

  const { GMAIL_EMAIL, GMAIL_APP_PASSWORD } = process.env;

  if (!GMAIL_EMAIL || !GMAIL_APP_PASSWORD) {
    return { statusCode: 500, body: "Faltan credenciales de Email en Netlify" };
  }

  try {
    const { orderId, status } = JSON.parse(event.body || '{}');

    if (!orderId || !status) {
      return { statusCode: 400, body: "orderId y status son requeridos" };
    }

    const orderRef = adminDb.collection(DB_PATHS.ORDERS).doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return { statusCode: 404, body: "Orden no encontrada" };
    }

    const orderData = { id: orderSnap.id, ...orderSnap.data() } as any;

    // Solo enviar si es 'in_transit' (En camino) o 'delivered' (Entregado)
    if (status !== 'in_transit' && status !== 'delivered') {
        return { statusCode: 200, body: "No se requiere email para este estado." };
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_EMAIL, pass: GMAIL_APP_PASSWORD },
    });

    const emailType = status === 'in_transit' ? 'in_transit' : 'delivered';
    const emailHtml = generateOrderEmailTemplate(orderData, emailType);
    
    let subject = "";
    if (status === 'in_transit') subject = `🚚 Tu pedido #${orderData.id.slice(-6).toUpperCase()} está en camino`;
    if (status === 'delivered') subject = `🎉 ¡Tu pedido ha sido entregado!`;

    await transporter.sendMail({
      from: `"DGO Tienda" <${GMAIL_EMAIL}>`,
      to: orderData.customerEmail,
      subject: subject,
      html: emailHtml,
    });

    return { statusCode: 200, body: JSON.stringify({ message: "Email enviado" }) };

  } catch (error: any) {
    console.error("Error sending status email:", error);
    return { statusCode: 500, body: error.message };
  }
};
