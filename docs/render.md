# Backend en Render

Preparación del primer despliegue. No crea servicios ni publica automáticamente.

## Rama

Trabajar en `desarrollo`, que conserva los avances de `upgrade/expo-58` y la preparación de Render. `main` se reserva para producción: fusionar únicamente cambios revisados y probados desde `desarrollo`. Render debe desplegar `main`. Mantener despliegue manual durante la preparación.

## Requisitos antes de iniciar

- PostgreSQL remoto con PostGIS y esquema instalado. `localhost` apunta al contenedor de Render, no a la Mac. Configurar TLS según el proveedor sin desactivar la validación del certificado.
- Fotos: configurar `SUPABASE_URL` (origen HTTPS), `SUPABASE_SECRET_KEY` (clave secreta `sb_secret_`, solo backend) y `SUPABASE_STORAGE_BUCKET=activity-photos`. Crear ese bucket como privado. El backend valida permisos antes de descargar, subir o eliminar; no se publican URLs del bucket. Sin configuración Supabase se conserva disco local en desarrollo. Producción exige Supabase o `PHOTO_STORAGE_DIR` en un disco persistente. Los archivos antiguos locales no se migran automáticamente.
- Sesiones y conexiones de chat en memoria: usar una sola instancia. Reinicios y despliegues cierran sesiones. La persistencia de sesiones queda pendiente.
- Revisar la configuración de proxy e IP de cliente en Render antes de aceptar tráfico real: los límites de solicitudes deben identificar al cliente correctamente.

## Crear el servicio

En Render: New → Web Service → conectar el repositorio **backend**.

| Campo | Valor |
| --- | --- |
| Runtime | Node |
| Branch final | main |
| Root Directory | Vacío: este repositorio ya es el backend |
| Build Command | npm ci --include=dev && npm run build |
| Start Command | npm run start:production |
| Auto-deploy | Desactivado durante la preparación |

`.node-version` selecciona Node 24. TypeScript es una dependencia de desarrollo y se necesita al compilar. `start:production` recibe variables del alojamiento; no exige un archivo `.env`. El comando `npm start` local permanece igual.

En Environment configurar `NODE_ENV=production`, `DATABASE_URL` remota y un `ATTENDANCE_PIN_SECRET` de producción con 64 caracteres hexadecimales. Render proporciona `PORT`; el código ya escucha en `0.0.0.0`. No copiar credenciales al repositorio.

Si se elige disco persistente, montar por ejemplo `/var/data` y configurar `PHOTO_STORAGE_DIR=/var/data/photos`. El disco debe existir realmente; poner solo la variable no vuelve persistentes los archivos.

Por ahora usar la comprobación TCP de Render; no configurar `/health`, porque la API todavía no implementa esa ruta. El backend solo abre el puerto después de conectar a la BD.

## Verificar

Tras resolver los requisitos, desplegar manualmente y comprobar `GET /categories`, registro/login, actividad, chat mediante WSS y subida/lectura de fotos. Verificar persistencia de archivos tras reiniciar y límites por IP. Después configurar la URL HTTPS del servicio en el entorno de compilación del mobile; no necesita un alojamiento frontend separado.

Documentación: https://render.com/docs/deploy-node-express-app
