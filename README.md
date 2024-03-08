# telegram-learn-bot
## Get started
```bash
docker compose up -d

npm i

npm run build

pm2 start "node ./dist/bot" --watch --name tg-bot --max-memory-restart 1024M
```
