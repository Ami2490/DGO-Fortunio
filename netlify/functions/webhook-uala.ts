import type { Handler } from "@netlify/functions";
import { adminDb } from './utils/firebase-admin';
import { DB_PATHS } from './utils/firebase';
import nodemailer from 'nodemailer';
import { generateOrderEmailTemplate } from './utils/email-templates';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo No Permitido' };
  }

  // 1. Obtener Configuración de Firestore para Email (Admin SDK)
  let siteConfig: any = null;
  try {
    const configSnap = await adminDb.collection('config').doc('siteConfig').get();
    if (configSnap.exists) {
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
      const orderRef = adminDb.collection(DB_PATHS.ORDERS).doc(orderId);
      const orderSnap = await orderRef.get();

      if (orderSnap.exists) {
        const orderData = { id: orderSnap.id, ...orderSnap.data() } as any;

        // 1. Actualizar estado si no está ya confirmado
        if (orderData.status !== 'confirmed') {
          await orderRef.update({ 
            status: 'confirmed',
            paymentId: body.uuid || 'UALA-' + Date.now(),
            paymentMethod: 'ualabis_pro'
          });

          // 2. Descontar stock (Admin SDK, sin restricciones de permisos)
          if (orderData.items && Array.isArray(orderData.items)) {
            for (const item of orderData.items) {
              try {
                const productRef = adminDb.collection('products').doc(item.productId);
                const productSnap = await productRef.get();
                if (productSnap.exists) {
                  const currentStock = productSnap.data()?.stock || 0;
                  const newStock = Math.max(0, currentStock - (item.quantity || 1));
                  await productRef.update({ stock: newStock });
                  console.log(`Stock actualizado (Ualá): ${item.name} → ${newStock}`);
                }
              } catch (stockErr) {
                console.error(`Error al actualizar stock de ${item.name}:`, stockErr);
              }
            }
          }

          // 3. Enviar Email de Confirmación
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
