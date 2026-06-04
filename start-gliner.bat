@echo off
echo Starting GLiNER API Server...
cd /d D:\Download\gliner_fine-tune
uvicorn api:app --host 0.0.0.0 --port 7777
