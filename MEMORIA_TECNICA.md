# MEMORIA TÉCNICA: CMS Headless Propio - Distribuidora DGO

## REGLA DE ORO
**PROHIBIDO EL HARDCODING.** La interfaz es un motor de renderizado puro. Los datos, el estilo y la estructura lógica residen en Firebase.

## 1. Arquitectura de Datos (Firestore)
El sitio se rige por un documento central `config/siteConfig`.

### Esquema de `siteConfig`:
- `nav`: `Array<{label: string, path: string, visible: boolean}>`
- `hero`: `{title: string, subtitle: string, bgImage: string, logoImage: string, buttonText: string, buttonColor: string, effectType: string}`
- `theme`: `{primaryColor: string, secondaryColor: string, borderRadius: string, fontBase: string}`
- `sections`: `Map<string, {title: string, content: string, images: string[], visible: boolean}>`
- `footer`: `{description: string, phone: string, email: string, address: string, social: {instagram: string, facebook: string}}`

## 2. Sistema de Tematización
Inyección de variables CSS en el `:root` mediante `ThemeContext` o componente de control superior.
- `--p`: Primary Color
- `--s`: Secondary Color
- `--br`: Border Radius

## 3. Dinamismo de Componentes
- **Bento Grid**: Renderizado asimétrico basado en el array `categories`.
- **Secciones**: Mapeo dinámico de la colección `pages` o el objeto `sections`.

## 4. Panel de Administración
Interfaz CRUD total para el objeto `siteConfig`. Permite mutar la identidad del negocio (ej: de Gastronomía a Frutería) sin despliegues de código.
