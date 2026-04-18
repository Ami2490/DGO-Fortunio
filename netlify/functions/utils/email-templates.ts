
const LOGO_URL = 'https://res.cloudinary.com/dwcyhvqnq/image/upload/q_auto/f_auto/v1776457929/jnjdhhdo7qghv8xbow9o.webp';
const BRAND_COLOR = '#10b981'; // Esmeralda
const BG_COLOR = '#0a1118';
const CARD_BG = '#111a24';

export const generateOrderEmailTemplate = (order: any, type: 'confirmed' | 'in_transit' | 'delivered') => {
  const statusConfig = {
    confirmed: {
      title: '¡Pago Confirmado!',
      subtitle: 'Estamos preparando tu pedido.',
      icon: '✅'
    },
    in_transit: {
      title: '¡Pedido en Camino!',
      subtitle: 'Tu paquete está siendo enviado.',
      icon: '🚚'
    },
    delivered: {
      title: '¡Pedido Entregado!',
      subtitle: 'Gracias por confiar en DGO.',
      icon: '🎉'
    }
  };

  const config = statusConfig[type];

  const itemsHtml = order.items.map((item: any) => `
    <tr>
      <td style="padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div style="display: flex; align-items: center; gap: 15px;">
          <img src="${item.image}" alt="${item.name}" style="width: 50px; hieght: 50px; border-radius: 10px; object-fit: cover; background: #000;">
          <div>
            <p style="margin: 0; color: #fff; font-weight: 900; font-size: 14px; text-transform: uppercase;">${item.name}</p>
            <p style="margin: 5px 0 0; color: #6b7280; font-size: 12px;">CANTIDAD: ${item.quantity} x $${item.price.toLocaleString()}</p>
          </div>
        </div>
      </td>
      <td style="padding: 15px 0; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: right; color: #fff; font-weight: 900;">
        $${(item.price * item.quantity).toLocaleString()}
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: ${BG_COLOR}; margin: 0; padding: 40px 20px; color: #fff; }
        .container { max-width: 600px; margin: 0 auto; background-color: ${CARD_BG}; border-radius: 40px; border: 1px solid rgba(255,255,255,0.05); overflow: hidden; }
        .header { padding: 40px; text-align: center; background: linear-gradient(to bottom, rgba(16,185,129,0.1), transparent); }
        .content { padding: 40px; }
        .footer { padding: 40px; text-align: center; border-top: 1px solid rgba(255,255,255,0.05); color: #6b7280; font-size: 12px; }
        .status-badge { display: inline-block; padding: 10px 20px; background: rgba(16,185,129,0.1); color: ${BRAND_COLOR}; border-radius: 20px; font-weight: 900; font-size: 12px; text-transform: uppercase; margin-bottom: 20px; letter-spacing: 2px; }
        .total-row { padding-top: 20px; margin-top: 20px; border-top: 2px solid ${BRAND_COLOR}; }
        .btn { display: inline-block; padding: 15px 30px; background-color: ${BRAND_COLOR}; color: #fff; text-decoration: none; border-radius: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <img src="${LOGO_URL}" alt="DGO Logo" style="width: 120px; margin-bottom: 20px;">
          <h1 style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #fff; text-transform: uppercase;">${config.title}</h1>
        </div>
        <div class="content">
          <div style="text-align: center; margin-bottom: 40px;">
            <div class="status-badge">${config.icon} ${config.subtitle}</div>
            <p style="color: #6b7280; font-size: 14px; margin-top: 10px;">PEDIDO #${order.id.slice(-6).toUpperCase()}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse;">
            ${itemsHtml}
          </table>

          <div class="total-row">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span style="color: #6b7280; font-size: 14px; font-weight: 900; text-transform: uppercase;">Total Pagado</span>
              <span style="color: ${BRAND_COLOR}; font-size: 24px; font-weight: 900;">$${order.total.toLocaleString()}</span>
            </div>
          </div>

          <div style="margin-top: 40px; padding: 25px; background: rgba(255,255,255,0.02); border-radius: 20px; border: 1px solid rgba(255,255,255,0.05);">
            <p style="margin: 0 0 10px; color: #fff; font-weight: 900; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Dirección de Entrega</p>
            <p style="margin: 0; color: #6b7280; font-size: 14px; line-height: 1.5;">${order.customerAddress}</p>
          </div>

          <div style="text-align: center;">
            <a href="${process.env.APP_URL}" class="btn">Ir a la Tienda</a>
          </div>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} DGO Tienda. Todos los derechos reservados.</p>
          <p>Este es un mensaje automático, por favor no respondas a este correo.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};
