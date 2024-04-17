# English-russian words learn telegram bot

## Get started
```bash
# Run postgres
docker compose up -d

# Run the bot
npm i

npm run build

pm2 start "node ./dist/bot" --watch --name tg-bot --max-memory-restart 1024M
```
