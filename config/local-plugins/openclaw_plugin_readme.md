# 🦞 OpenClaw Plugin Workflow (Docker + Windows/WSL)

## 🎯 Objetivo
Flujo claro para crear/actualizar plugins sin errores de permisos ni versiones.

---

## ⚠️ REGLA DE ORO

❌ Nunca ejecutes npm install dentro del contenedor  
✅ Siempre: HOST → npm install → copiar → restart

---

## 📁 RUTAS

Host:
C:\Users\maror\Downloads\OPENCLAW_DOCKER_INSTALLER\openclaw-data\.openclaw\local-plugins

Contenedor:
/home/openclaw/runtime-plugins

---

## 🚀 ACTUALIZAR PLUGIN

1) Ir al plugin:
cd "C:\Users\maror\Downloads\OPENCLAW_DOCKER_INSTALLER\openclaw-data\.openclaw\local-plugins\notion-recruiter-crm"

2) Instalar deps:
npm install

3) Build (no siempre necesario):
npm run build

4) Borrar runtime:
docker compose exec openclaw sh -lc "rm -rf /home/openclaw/runtime-plugins/notion-recruiter-crm"

5) Copiar:
docker compose cp "C:\Users\maror\Downloads\OPENCLAW_DOCKER_INSTALLER\openclaw-data\.openclaw\local-plugins\notion-recruiter-crm" openclaw:/home/openclaw/runtime-plugins/

6) Reiniciar:
docker compose restart openclaw

7) Verificar:
docker compose exec openclaw openclaw plugins list

---

## 🔍 DEBUG

Ver plugins:
docker compose exec openclaw openclaw plugins list

Diagnóstico:
docker compose exec openclaw openclaw plugins doctor

---

## 🚨 ERRORES

Cannot find module → falta npm install en host  
EACCES → estás escribiendo en contenedor  
Plugin no cambia → no copiaste/reiniciaste  

---

## 🧠 CONSEJO

El 90% de los bugs son de deploy, no de código.
