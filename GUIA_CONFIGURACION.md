# 🚀 Guía de Configuración: Gmail y Mercado Pago

Esta guía te ayudará a obtener las claves necesarias y configurar tu panel de Netlify para que el sistema de cobros y emails funcione al 100%.

---

## 1. Configurar Gmail (Contraseña de Aplicación)

Para que DGO pueda enviar correos en tu nombre, necesitamos una clave especial que Google otorga a aplicaciones.

1.  Entra a tu **Cuenta de Google** (Gmail).
2.  Ve a la sección **Seguridad**.
3.  Activa la **Verificación en dos pasos** (si no la tenés activa, Google no te dejará crear la clave).
4.  Una vez activa, busca en el buscador de la cuenta: **"Contraseñas de aplicaciones"**.
5.  En "Nombre de la aplicación", poné: `DGO Tienda`.
6.  Dale a **Crear**.
7.  **IMPORTANTE**: Google te mostrará un código de **16 caracteres** (ej: `abcd efgh ijkl mnop`). **Copiá ese código**, es el que vamos a usar en Netlify como `GMAIL_APP_PASSWORD`.

---

## 2. Configurar Mercado Pago (Webhook)

Mercado Pago necesita una URL para avisarnos cuando alguien paga.

1.  Entra al **Panel de Desarrolladores de Mercado Pago**.
2.  Ve a **Tus Aplicaciones** y selecciona la de DGO (o crea una nueva).
3.  Busca la sección **Notificaciones Webhooks**.
4.  En **URL de producción (o modo prueba)**, pega la siguiente dirección:
    `https://[TU-SITIO-EN-NETLIFY].netlify.app/.netlify/functions/webhook`
    *(Reemplaza `[TU-SITIO-EN-NETLIFY]` por el nombre real que te asigne Netlify)*.
5.  En **Eventos**, marcá únicamente:
    - [x] `payment` (Pagos)
6.  Dale a **Guardar**.

---

## 3. Variables de Entorno en Netlify

Ahora, ve a tu panel de **Netlify** -> **Site configuration** -> **Environment variables** y agregá estas:

| Variable | Valor |
| :--- | :--- |
| `GMAIL_EMAIL` | Tu cuenta de correo de Gmail (ej: `hola@gmail.com`) |
| `GMAIL_APP_PASSWORD` | La clave de 16 caracteres que creaste en el paso 1. |
| `MP_ACCESS_TOKEN` | Tu Access Token de Mercado Pago (lo sacas de "Credenciales de Producción"). |
| `APP_URL` | La URL de tu sitio (ej: `https://dgo-tienda.netlify.app`) |

---

> [!TIP]
> Una vez que cargues estas variables, Netlify reiniciará tu sitio automáticamente y ya podrás probar una compra real.
