import { Bot, CommandContext, Context, GrammyError, HearsContext, HttpError, Keyboard, session, SessionFlavor } from "grammy";
import { PsqlAdapter } from '@grammyjs/storage-psql';
import { Client } from "pg";
import words from './words';
import dotenv from 'dotenv';
dotenv.config();

interface SessionData {
  knownWords: {english: string, russian: string}[] 
  unknownWords: {english: string, russian: string}[]
  currentWord: {english: string, russian: string}
}
type MyContext = Context & SessionFlavor<SessionData>;

const keys = Object.keys(words)

async function bootstrap() {
  const client = new Client(
    String(process.env.DATABASE_URL)
  );
  
  await client.connect();

  const bot = new Bot<MyContext>(String(process.env.BOT_TOKEN));
  bot.use(
    session({
      initial: () => ({ knownWords: [], unknownWords: [], currentWord: ''  }),
      storage: await PsqlAdapter.create({ tableName: 'sessions', client }),
    })
  );

  bot.command("start", async(ctx) =>
    ctx.replyWithPhoto('https://koteiki.com/wp-content/uploads/2019/05/011.jpg')
    .then(() => {ctx.reply('Привет! Меня зовут Арнольд, я знаю 3000 английских слов! Я помогу тебе выучить их!', {
      reply_markup: {
        keyboard: [
          [{ text: 'Учить слова' }],
        ],
        resize_keyboard: true,
      },
    })})
  );

  bot.command('learn', async (ctx) => {
    sendNextWord(ctx);
  });
  
  bot.command('menu', (ctx) => {
    ctx.reply('Выбери действие:', {
      reply_markup: {
        keyboard: [
          [{ text: 'Учить слова' }],
          [{ text: 'Слова которые я не знаю' }],
        ],
        resize_keyboard: true,
      },
    });
  });

  bot.command('words', async (ctx) => {
    const {unknownWords} = ctx.session;
    ctx.reply(`Вот тебе 10 слов, постарайся запомнить их\nЯ обязательно спрошу их еще раз :)\n\n${unknownWords.slice(0,10).map(word => `_${word.english}_ - ${word.russian}`).join('\n\n')}`, {parse_mode: 'Markdown', reply_markup: {
      keyboard: [
        [{ text: 'Учить слова' }],
      ],
      resize_keyboard: true,
    }});
  });

  bot.hears('Учить слова', async (ctx) => {
    sendNextWord(ctx);
  });
  
  bot.hears('Слова которые я не знаю', (ctx) => {
    const {unknownWords} = ctx.session;
    ctx.reply(`Вот тебе 10 слов, постарайся запомнить их\nЯ обязательно спрошу их еще раз :)\n\n${unknownWords.slice(0,10).map(word => `_${word.english}_ - ${word.russian}`).join('\n\n')}`, {parse_mode: 'Markdown', reply_markup: {
      keyboard: [
        [{ text: 'Учить слова' }],
      ],
      resize_keyboard: true,
    }});
  });

  bot.hears('Меню', async (ctx) => {
    ctx.reply('Выбери действие:', {
      reply_markup: {
        keyboard: [
          [{ text: 'Учить слова' }],
          [{ text: 'Слова которые я не знаю' }],
        ],
        resize_keyboard: true,
      },
    });
  });

  bot.hears(['Знаю', 'Не знаю'], async (ctx) => {
    const userChoice = ctx.message?.text;
    const wordPair = ctx.session.currentWord;
    const {knownWords, unknownWords} = ctx.session;

    if (userChoice === 'Знаю') {
      if (!knownWords.some(word => word.english === wordPair.english)) knownWords.push(wordPair)

      if(unknownWords.some(word => word.english === wordPair.english)) unknownWords.splice(unknownWords.findIndex(word => word.english === wordPair.english), 1);

      await ctx.reply(`Супер!\n\n${wordPair.english} - __*${wordPair.russian}*__\n\nТвое следующее слово:`, {parse_mode: 'Markdown'});
    } else if (userChoice === 'Не знаю') {
      if (!unknownWords.some(word => word.english === wordPair.english)) unknownWords.push(wordPair)
      await ctx.reply(`${wordPair.english} переводится как __*${wordPair.russian}*__\n\nЯ запомню его для тебя здесь /words\nТвое следующее слово:`, {parse_mode: 'MarkdownV2'});
    }

    sendNextWord(ctx)
  }); 
  
  function sendNextWord(ctx: HearsContext<MyContext> | CommandContext<MyContext>) {
    const { knownWords } = ctx.session;
    const filteredKeys = keys.filter(key => !knownWords.some(word => word.english === key));

    if(filteredKeys.length === 0) return ctx.reply('Ты выучил все слова! Поздравляю =)');

    const wordPair = words[filteredKeys[Math.floor(Math.random() * filteredKeys.length)]];
    ctx.session.currentWord = wordPair;

    ctx.reply(`Ты знаешь как перевести __*${wordPair.english}*__?`, {
        reply_markup: {
            keyboard: [
                [{ text: 'Знаю' }, { text: 'Не знаю' }],
                [{ text: 'Меню' }]
            ],
            resize_keyboard: true,
        },
        parse_mode: 'MarkdownV2'
    });
  }

  bot.catch((err) => {
    const ctx = err.ctx;
    console.error(`Error while handling update ${ctx.update.update_id}:`);
    const e = err.error;
    if (e instanceof GrammyError) {
      console.error("Error in request:", e.description);
    } else if (e instanceof HttpError) {
      console.error("Could not contact Telegram:", e);
    } else {
      console.error("Unknown error:", e);
    }
  });
  
  bot.start();
}

bootstrap()