import type { Handler } from "@netlify/functions";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { DB_PATHS } from './utils/firebase';
import { adminDb } from './utils/firebase-admin';
import nodemailer from 'nodemailer';
import { generateOrderEmailTemplate } from './utils/email-templates';

export const handler: Handler = async (event) => {
  console.log("--- MP Webhook Trace (ENTRADA) ---");
  console.log("Headers:", JSON.stringify(event.headers));
  console.log("Body Received:", event.body || "EMPTY");
  console.log("------------------------");

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo No Permitido' };
  }

  // 1. Obtener Configuración de Firestore para Tokens y Email
  let siteConfig: any = null;
  try {
    const configSnap = await adminDb.collection('config').doc('siteConfig').get();
    if (configSnap.exists) {
      siteConfig = configSnap.data();
      console.log("Configuración de Firestore recuperada con éxito.");
    } else {
      console.warn("No se encontró el documento config/siteConfig en Firestore.");
    }
  } catch (err) {
    console.error("Error al leer config de Firestore en webhook:", err);
  }

  // Credenciales de MP (Requeridas para validar el pago)
  const MP_ACCESS_TOKEN = siteConfig?.paymentCredentials?.mercadopago?.accessToken || process.env.MP_ACCESS_TOKEN;
  
  // Credenciales de Gmail (Opcionales ahora)
  const GMAIL_EMAIL = siteConfig?.notificationEmail || process.env.GMAIL_EMAIL;
  const GMAIL_APP_PASSWORD = siteConfig?.notificationPass || process.env.GMAIL_APP_PASSWORD;

  // Detección de Site URL (Fallback a la estructura anidada que tiene Alan)
  const host = event.headers.host || 'distribuidoradgo.netlify.app';
  const protocol = event.headers['x-forwarded-proto'] || 'https';
  const detectedUrl = `${protocol}://${host}`;
  const SITE_URL = siteConfig?.siteUrl || siteConfig?.paymentCredentials?.mercadopago?.siteUrl || detectedUrl;
  const APP_URL = SITE_URL.replace(/\/$/, '');

  if (!MP_ACCESS_TOKEN) {
    console.warn("ALERTA: Falta el Access Token de Mercado Pago. No se puede procesar el pago.");
    return { statusCode: 500, body: "Falta el Access Token de Mercado Pago. Configuralas en el Panel." };
  }

  // Log de diagnóstico (sin filtrar tokens sensibles)
  console.log(`Estado de credenciales -> MP: OK, Gmail: ${GMAIL_EMAIL ? 'Configurado' : 'FALTANTE (Opcional)'}`);

  try {
    const body = JSON.parse(event.body || '{}');
    
    // Los webhooks de MP pueden venir en dos formatos principales:
    // 1. { "type": "payment", "data": { "id": "..." } }
    // 2. { "topic": "payment", "resource": "..." o URL }
    let paymentId = body.data?.id;
    
    if (!paymentId) {
      if (body.topic === 'payment' || body.type === 'payment') {
        const resource = body.resource || "";
        // Si resource es una URL (ej: https://api.mercadopago.com/v1/payments/123), extraemos el ID
        paymentId = resource.includes('/') ? resource.split('/').pop() : resource;
      }
    }

    if (!paymentId) {
      console.log("Webhook recibido sin ID de pago válido para procesar. Body:", JSON.stringify(body));
      return { statusCode: 200, body: "Ok (No payment ID)" };
    }

    const client = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN });
    const payment = new Payment(client);
    const mpPayment = await payment.get({ id: paymentId });

    const orderId = mpPayment.external_reference;
    const status = mpPayment.status;

    console.log(`Procesando Pago ${paymentId} para Orden ${orderId}. Estado: ${status}`);

    if (orderId && (status === 'approved' || status === 'authorized')) {
      const orderRef = adminDb.collection(DB_PATHS.ORDERS).doc(orderId);
      const orderSnap = await orderRef.get();

      if (orderSnap.exists) {
        const orderData = { id: orderSnap.id, ...orderSnap.data() } as any;

        // 1. Actualizar estado si no está ya confirmado
        if (orderData.status !== 'confirmed') {
          await orderRef.update({ 
            status: 'confirmed',
            paymentId: paymentId,
            paymentMethod: 'mercadopago_pro'
          });

          // 2. Enviar Email de Confirmación
          if (GMAIL_EMAIL && GMAIL_APP_PASSWORD) {
            try {
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

              console.log(`Orden ${orderId} confirmada y email enviado.`);
            } catch (emailErr) {
              console.error("Error al enviar email de confirmación:", emailErr);
            }
          } else {
            console.log(`Orden ${orderId} confirmada. Envío de email saltado (sin configurar).`);
          }
        } else {
          console.log(`La orden ${orderId} ya estaba en estado 'confirmed'. No se requiere actualización.`);
        }
      } else {
        console.warn(`La orden ${orderId} no existe en Firebase.`);
      }
    }

    return { statusCode: 200, body: "Ok" };

  } catch (error: any) {
    console.error("Webhook Error Grave:", error);
    return { statusCode: 500, body: error.message };
  }
};
