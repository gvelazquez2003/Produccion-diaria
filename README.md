# Produccion Diaria

Formulario estatico (Vercel) que registra produccion en el Sheet existente. El listado de ingredientes se toma de la hoja `COSTO MATERIA PRIMA` y las filas se guardan en la pestaña `TRASLADOS_2`.

## Archivos
- index.html
- styles.css
- main.js
- apps_script_produccion_diaria.gs (Apps Script para el Web App)

## Campos que se envian
- Fecha (AAAA-MM-DD)
- Codigo (resuelto contra COSTO MATERIA PRIMA)
- Ingrediente (nombre del codigo elegido)
- Cantidad producida
- Se deja vacia la columna `UND PRINCIPAL` para no tocar la formula.

## Apps Script
1. Abre el Sheet https://docs.google.com/spreadsheets/d/1MQlP9wx199xW-gIYwf4FcjdANG9TLEkSjORiNmxJH5s/edit#gid=1067690037 (gid de TRASLADOS_2) y ve a Extensiones > Apps Script.
2. Crea un archivo y pega el contenido de `apps_script_produccion_diaria.gs`.
3. Comprueba o ajusta las constantes si cambian los nombres:
   - `SOURCE_SHEET = "COSTO MATERIA PRIMA"`
   - `TARGET_SHEET = "TRASLADOS_2"`
4. Implementa > Nueva implementacion > Tipo Web App > Ejecutar como: tu cuenta > Acceso: Cualquiera con el enlace. Copia la URL `/exec`.

## Frontend (Vercel estatico)
1. Reemplaza en `main.js`:
   - `GAS_ENDPOINT` por la URL de despliegue del Apps Script (termina en `/exec`).
   - `MENU_LINK` por la URL del menu principal.
2. Despliega los archivos estaticos con Vercel, por ejemplo:
   ```bash
   npm i -g vercel
   vercel deploy --prod
   ```
3. Prueba el formulario en la URL resultante. Al enviar, se deben agregar filas en `TRASLADOS_2` con las columnas [FECHA, CODIGO, INGREDIENTE, "", CANTIDAD PRODUCIDA].

## Notas
- El input de fecha trae el dia actual por defecto y se puede editar.
- Solo se aceptan ingredientes existentes en la hoja de costos; el formulario marca error si no hay coincidencia.
- El Apps Script expone `GET ?mode=ingredientes` para poblar el datalist del frontend.
