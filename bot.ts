import { Bot, CommandContext, Context, GrammyError, HearsContext, HttpError, Keyboard, session, SessionFlavor } from "grammy";
import { PsqlAdapter } from '@grammyjs/storage-psql';
import { Client } from "pg";
import words from './words';
import dotenv from 'dotenv';
import { test } from "node:test";
dotenv.config();

interface SessionData {
  knownWords: {english: string, russian: string}[] 
  unknownWords: {english: string, russian: string}[]
  currentWord: {english: string, russian: string}
  testStarted: boolean
  testWords: {english: string, russian: string}[]
  testSteps: number
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
      initial: () => ({ knownWords: [], unknownWords: [], currentWord: '', testStarted: false, testWords: [], testSteps: 0, user: {id: '', name: ''} }),
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
        inline_keyboard: [
          [{ text: 'Учить слова 🚴🏼', callback_data: 'start' }],
        ],
      },
    })
  });

  bot.command('learn', async (ctx) => {
    sendNextWord(ctx);
  });
  
  bot.command('menu', (ctx) => {
    contextMenu(ctx);
  });

  bot.command('words', async (ctx) => {
    showUnknownWords(ctx);
  });

  bot.command('stop_test', async (ctx) => {
    ctx.session.testStarted = false;
    ctx.session.testSteps = 0;
    ctx.session.testWords = [];
    ctx.reply('Тест окончен!\n\nПерейдите в /menu')
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

  bot.hears('Учить слова 🚴🏼', async (ctx) => {
    sendNextWord(ctx);
  });
  
  bot.hears('Мои слова 🧑🏼‍🎓', (ctx) => {
    showUnknownWords(ctx);
  });

  bot.hears(['Меню 🛎', 'Меню', 'меню', 'Menu', 'menu'], async (ctx) => {
    contextMenu(ctx);
  });

  bot.hears('Почему именно 3000 слов 🧐', async (ctx) => {
    const { name } = ctx.session.user;
    ctx.reply(`${name || 'Мой друг'}, если вы будете знать от 2500 до 3000 слов, то вы сможете понимать 90% повседневных разговоров, научных статей, а так же английский на рабочем месте!\n\nОстальные 10% вы будете понимать из контекста. Ваш словарный запас станет полностью функциональным 😱🤗`, {
      reply_markup: {
        keyboard: [
          [{ text: 'Меню 🛎' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'Markdown',
    });
  });

  bot.hears('Поддержать Арнольда 💵', async (ctx) => {
    const { name } = ctx.session.user;
    ctx.reply(`${name || 'Мой друг'}, спасибо Вам за вашу поддержку!👋\n\nНе хотел святить своими данными здесь 😜, напишите мне пожалуйста: @eugeek`, {
      reply_markup: {
        keyboard: [
          [{ text: 'Меню 🛎' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'Markdown',
    });
  });

  bot.hears('Мне нужна помощь 🦸🏼‍♂️', async (ctx) => {
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

  bot.callbackQuery("start", async (ctx) => {
    sendNextWord(ctx as HearsContext<MyContext>);
  });

  bot.callbackQuery("menu", async (ctx) => {
    contextMenu(ctx as HearsContext<MyContext>);
  });

  bot.callbackQuery("know_it", async (ctx) => {
    const userChoice = ctx.message?.text;
    const wordPair = ctx.session.currentWord;
    const { knownWords, unknownWords } = ctx.session;
    
    await ctx.deleteMessage();

    if (!knownWords.some(word => word.english === wordPair.english)) knownWords.push(wordPair)
    if(unknownWords.some(word => word.english === wordPair.english)) unknownWords.splice(unknownWords.findIndex(word => word.english === wordPair.english), 1);
    
    const message = `Молодец! Проверь:\n\n${wordPair.english} - __*${wordPair.russian}*__\n\nСледующее слово:`;

    await ctx.reply(message, {parse_mode: 'Markdown'});

    sendNextWord(ctx as HearsContext<MyContext>);
  });

  bot.callbackQuery("dont_know_it", async (ctx) => {
    const wordPair = ctx.session.currentWord;
    const { unknownWords } = ctx.session;
    
    await ctx.deleteMessage();

    if (!unknownWords.some(word => word.english === wordPair.english)) unknownWords.push(wordPair)
    
    const message = `Бывает, ты можешь выучить его в /words\n\n${wordPair.english} переводится как __*${wordPair.russian}*__\n\nСледующее слово:`;

    await ctx.reply(message, {parse_mode: 'MarkdownV2'});
    
    sendNextWord(ctx as HearsContext<MyContext>);
  });

  bot.callbackQuery("test_right", async (ctx) => {
    const wordPair = ctx.session.currentWord;
    const {knownWords, unknownWords, testStarted, testSteps, testWords} = ctx.session;
    
    await ctx.deleteMessage();
    
    if(testStarted) ctx.session.testSteps++;
    if (!knownWords.some(word => word.english === wordPair.english)) knownWords.push(wordPair)
    if(unknownWords.some(word => word.english === wordPair.english)) unknownWords.splice(unknownWords.findIndex(word => word.english === wordPair.english), 1);
    
    const message = `Верно, Молодец!\nЯ убрал его из /words!\n\nСледующее слово:`;

    await ctx.reply(message, {parse_mode: 'Markdown'});

    sendTestWord(ctx as HearsContext<MyContext>);
  });

  bot.callbackQuery("test_wrong", async (ctx) => {
    const wordPair = ctx.session.currentWord;
    const { unknownWords, testWords, testStarted, testSteps } = ctx.session;
    
    await ctx.deleteMessage();
    
    if(testStarted) ctx.session.testSteps++;
    if (!unknownWords.some(word => word.english === wordPair.english)) unknownWords.push(wordPair)
    
    const message = `На самом деле ${wordPair.english} переводится как __*${wordPair.russian}*__\n\nЭто слово остается в /words\n\nСледующее слово`;

    await ctx.reply(message, {parse_mode: 'MarkdownV2'});
    
    sendTestWord(ctx as HearsContext<MyContext>);
  });


  bot.callbackQuery("test", async (ctx) => {
    const { unknownWords, testStarted } = ctx.session;
    
    await ctx.deleteMessage();

    if (testStarted || unknownWords.length < 10) return ctx.reply('Вы не можете начать тест!\n\nВы уже начали тест или у вас меньше 10 слов в /words');
    
    ctx.session.testStarted = true;
    ctx.session.testSteps = 0;
    ctx.session.testWords = unknownWords.slice(0,10).sort(() => Math.random() - 0.5);
    
    await ctx.reply(`Этот тест будет содержать 10 вопросов\n\nНадеюсь ты выучил эти слова =)\n\nУ тебя все получится!`, {parse_mode: 'Markdown'});
    
    sendTestWord(ctx as HearsContext<MyContext>);
  });

  function showUnknownWords(ctx: HearsContext<MyContext> | CommandContext<MyContext>) {
    const { unknownWords } = ctx.session;
    const words = unknownWords.slice(0,10).map(word => `_${word.english}_ - ${word.russian}`).join('\n\n');

    const message = unknownWords.length >= 10 ? `У тебя *${unknownWords.length}* невыученных слов, я покажу тебе 10 из них.\n\nТы можешь пройти тест и убрать выученные слова отсюда =)\n\n` : 
    `У тебя *${unknownWords.length}* невыученных слов\n\nКогда наберется хотя бы 10 слов, ты сможешь пройти тест и убрать их отсюда =)\n\n`
    ctx.reply(`${message}${words}`, {parse_mode: 'Markdown', reply_markup: {
      inline_keyboard: [
        [
          {'text': 'Пройти тест по этим словам', 'callback_data': 'test'}, 
        ],
      ],
      resize_keyboard: true,
    }});
  }

  function contextMenu(ctx: HearsContext<MyContext> | CommandContext<MyContext>) {
    const { name } = ctx.session.user;
    const { knownWords } = ctx.session;

    ctx.reply(`${name || ''}, ты уже знаешь __${knownWords.length}__ слов 🎉`, {
      reply_markup: {
        keyboard: [
          [{ text: 'Учить слова 🚴🏼' }],
          [{ text: 'Мои слова 🧑🏼‍🎓' }],
          [{ text: 'Почему именно 3000 слов 🧐' }],
          [{ text: 'Поддержать Арнольда 💵' }],
          [{ text: 'Мне нужна помощь 🦸🏼‍♂️' }],
        ],
        resize_keyboard: true,
      },
      parse_mode: 'MarkdownV2',
    });
  }
  
  function sendNextWord(ctx: HearsContext<MyContext> | CommandContext<MyContext>) {
    const { knownWords, unknownWords, testStarted } = ctx.session;

    if (testStarted) return ctx.reply('Вы еще не закончили тест!\n\nВы можете это сделать командой\n/stop_test')

    const filteredKeys = keys.filter(key => !knownWords.some(word => word.english === key));
    if(filteredKeys.length === 0) return ctx.reply('Ты выучил все слова! Поздравляю =)');
    const wordPair = words[filteredKeys[Math.floor(Math.random() * filteredKeys.length)]];
    ctx.session.currentWord = wordPair;

    ctx.reply(`Ты знаешь как перевести __*${wordPair.english}*__?`, {
      reply_markup: {
        inline_keyboard: [
            [{ text: 'Знаю ✅', callback_data: 'know_it' }, { text: 'Пока не знаю 🆘', callback_data: 'dont_know_it' }],
            [{ text: 'Меню 🛎', callback_data: 'menu' }],
        ],
      },
      parse_mode: 'MarkdownV2'
    });
  }

  function sendTestWord(ctx: HearsContext<MyContext> | CommandContext<MyContext>) {
    const { testWords, testSteps } = ctx.session;

    if(testSteps > 9) {
      ctx.session.testStarted = false;
      ctx.session.testSteps = 0;
      ctx.session.testWords = [];
      return ctx.reply('Тест окончен!\n\nТы можешь посмотреть слова которые ты не знал в /words');
    }

    const wordPair = testWords[testSteps];
    ctx.session.currentWord = wordPair;

    const wrongWordPairs = testWords
      .filter(word => word.english !== wordPair.english).slice(0,3)
      .map(word => ({text: word.russian, callback_data: 'test_wrong'}));
    const answers = [{text: wordPair.russian, callback_data: 'test_right'}, ...wrongWordPairs].sort(() => Math.random() - 0.5);

    ctx.reply(`[${testSteps+1}/10] Как переводится __*${wordPair.english}*__?`, {
      reply_markup: {
        inline_keyboard: [
            [answers[0]],
            [answers[1]],
            [answers[2]],
            [answers[3]]
        ],
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