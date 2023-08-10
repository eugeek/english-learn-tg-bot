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
  user: {id: number, name: string}
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

  bot.command("start", async(ctx) => {
    const { from } = ctx.update.message as any;

    if (from) {
      ctx.session.user = {id: from.username || '', name: from.first_name || 'student'}
    }

    await ctx.replyWithPhoto('https://koteiki.com/wp-content/uploads/2019/05/011.jpg')
    await ctx.reply('Привет! Меня зовут кот Арнольд, я знаю 3000 английских слов! Я помогу тебе выучить их! Хочешь начать?🔥', {
      reply_markup: {
        keyboard: [
          [{ text: 'Учить слова 🧑🏾‍🎓' }],
        ],
        resize_keyboard: true,
      },
    })
  });

  bot.command('learn', async (ctx) => {
    sendNextWord(ctx);
  });
  
  bot.command('menu', (ctx) => {
    const { name } = ctx.session.user;
    const { knownWords, unknownWords } = ctx.session;
    const word = knownWords.length === 1 ? 'слово' : knownWords.length > 1 && knownWords.length < 5 ? 'слова' : 'слов';
    ctx.reply(`${name || ''}, ты уже знаешь __${knownWords.length}__ ${word} 🎉`, {
      reply_markup: {
        keyboard: [
          [{ text: 'Учить слова 🧑🏾‍🎓' }],
          [{ text: 'Слова которые я пока не знаю 🐼' }],
          [{ text: 'Мне нужна помощь 🧑‍🚒' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'MarkdownV2',
    });
  });

  bot.command('words', async (ctx) => {
    const {unknownWords} = ctx.session;
    ctx.reply(`Вот тебе 10 слов, постарайся запомнить их\nЯ обязательно спрошу их еще раз :)\n\n${unknownWords.slice(0,10).map(word => `_${word.english}_ - ${word.russian}`).join('\n\n')}`, {parse_mode: 'Markdown', reply_markup: {
      keyboard: [
        [{ text: 'Учить слова 🧑🏾‍🎓' }],
      ],
      resize_keyboard: true,
    }});
  });

  bot.command('help', (ctx) => {
    const { name } = ctx.session.user;
    ctx.reply(`${name || ''}, если у тебя возник какой-то вопрос, то можешь написать моему *создателю*:\n\n@eugeek`, {
      reply_markup: {
        keyboard: [
          [{ text: 'Меню 🛎' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'MarkdownV2',
    });
  });

  bot.hears('Учить слова 🧑🏾‍🎓', async (ctx) => {
    sendNextWord(ctx);
  });
  
  bot.hears('Слова которые я пока не знаю 🐼', (ctx) => {
    const { unknownWords } = ctx.session;
    ctx.reply(`Вот тебе 10 слов, постарайся запомнить их\nЯ обязательно спрошу их еще раз :)\n\n${unknownWords.slice(0,10).map(word => `_${word.english}_ - ${word.russian}`).join('\n\n')}`, {parse_mode: 'Markdown', reply_markup: {
      keyboard: [
        [{ text: 'Учить слова 🧑🏾‍🎓' }],
      ],
      resize_keyboard: true,
    }});
  });

  bot.hears('Меню 🛎', async (ctx) => {
    const { name } = ctx.session.user;
    const { knownWords, unknownWords } = ctx.session;
    const word = knownWords.length === 1 ? 'слово' : knownWords.length > 1 && knownWords.length < 5 ? 'слова' : 'слов';
    ctx.reply(`${name || ''}, ты уже знаешь __${knownWords.length}__ ${word} 🎉`, {
      reply_markup: {
        keyboard: [
          [{ text: 'Учить слова 🧑🏾‍🎓' }],
          [{ text: 'Слова которые я пока не знаю 🐼' }],
          [{ text: 'Мне нужна помощь 🧑‍🚒' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'MarkdownV2',
    });
  });

  bot.hears(['Знаю ⭐️', 'Пока не знаю 🍀'], async (ctx) => {
    const userChoice = ctx.message?.text;
    const wordPair = ctx.session.currentWord;
    const {knownWords, unknownWords} = ctx.session;

    if (userChoice === 'Знаю ⭐️') {
      if (!knownWords.some(word => word.english === wordPair.english)) knownWords.push(wordPair)

      if(unknownWords.some(word => word.english === wordPair.english)) unknownWords.splice(unknownWords.findIndex(word => word.english === wordPair.english), 1);

      await ctx.reply(`Супер!\n\n${wordPair.english} - __*${wordPair.russian}*__\n\nТвое следующее слово:`, {parse_mode: 'Markdown'});
    } else if (userChoice === 'Пока не знаю 🍀') {
      if (!unknownWords.some(word => word.english === wordPair.english)) unknownWords.push(wordPair)
      await ctx.reply(`${wordPair.english} переводится как __*${wordPair.russian}*__\n\nЯ запомню его для тебя здесь /words\nТвое следующее слово:`, {parse_mode: 'MarkdownV2'});
    }

    sendNextWord(ctx)
  });

  bot.hears('Мне нужна помощь 🧑‍🚒', async (ctx) => {
    const { name } = ctx.session.user;
    ctx.reply(`${name || ''}, если у тебя возник какой-то вопрос, то можешь написать моему *создателю*:\n\n@eugeek\n\nP.S. кот Арнольд`, {
      reply_markup: {
        keyboard: [
          [{ text: 'Меню 🛎' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'Markdown',
    });
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
                [{ text: 'Знаю ⭐️' }, { text: 'Пока не знаю 🍀' }],
                [{ text: 'Меню 🛎' }]
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