import type { Handler } from "@netlify/functions";
import { db, DB_PATHS } from './utils/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import nodemailer from 'nodemailer';
import { generateOrderEmailTemplate } from './utils/email-templates';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo No Permitido' };
  }

  // 1. Obtener Configuración de Firestore para Email
  let siteConfig: any = null;
  try {
    const configSnap = await getDoc(doc(db, 'config', 'siteConfig'));
    if (configSnap.exists()) {
      siteConfig = configSnap.data();
    }
  } catch (err) {
    console.error("Error al leer config de Firestore en uala webhook:", err);
  }

  const GMAIL_EMAIL = siteConfig?.notificationEmail || process.env.GMAIL_EMAIL;
  const GMAIL_APP_PASSWORD = siteConfig?.notificationPass || process.env.GMAIL_APP_PASSWORD;

  try {
    const body = JSON.parse(event.body || '{}');
    console.log("Ualá Bis Webhook received:", body);

    // Ualá Bis envía status y order_id (referencia externa)
    const orderId = body.order_id;
    const status = body.status; // 'PAID' es el estado exitoso típico en Ualá Bis V2

    if (orderId && (status === 'PAID' || status === 'APPROVED')) {
      const orderRef = doc(db, DB_PATHS.ORDERS, orderId);
      const orderSnap = await getDoc(orderRef);

      if (orderSnap.exists()) {
        const orderData = { id: orderSnap.id, ...orderSnap.data() } as any;

        // 1. Actualizar estado si no está ya confirmado
        if (orderData.status !== 'confirmed') {
          await updateDoc(orderRef, { 
            status: 'confirmed',
            paymentId: body.uuid || 'UALA-' + Date.now(),
            paymentMethod: 'ualabis_pro'
          });

          // 2. Enviar Email de Confirmación
          if (GMAIL_EMAIL && GMAIL_APP_PASSWORD && orderData.customerEmail) {
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: GMAIL_EMAIL, pass: GMAIL_APP_PASSWORD },
            });

            const emailHtml = generateOrderEmailTemplate(orderData, 'confirmed');

            await transporter.sendMail({
              from: `"DGO Tienda" <${GMAIL_EMAIL}>`,
              to: orderData.customerEmail,
              subject: `¡Pago Confirmado! Tu pedido #${orderData.id.slice(-6).toUpperCase()} está listo ✅`,
              html: emailHtml,
            });
          }

          console.log(`Orden ${orderId} confirmada vía Ualá Bis y email enviado.`);
        }
      }
    }

    return { statusCode: 200, body: "Ok" };

  } catch (error: any) {
    console.error("Ualá Webhook Error:", error);
    return { statusCode: 500, body: error.message };
  }
};
