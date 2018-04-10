import puppeteer, { Browser, Page, Cookie } from 'puppeteer';

type InputCallback = (page: Page, value: string) => void;
type InputConfig = string | InputCallback;

interface ClientOptions {
  debug?: boolean;
  signinUrl: string;
  username: InputConfig;
  password: InputConfig;
  submit: InputConfig;
}

interface EventsMap {
  readySignin?(page: Page, args: [string, string, any]): void;
  beforeSubmit?(page: Page, args: [string, string, any]): void;
  beforeNavigation?(page: Page, args: [string, string, any]): void;
  error?(e: Error): void;
}

interface CookieFilter {
  domain?: string | RegExp;
  path?: string | RegExp;
  expired?: boolean | 'all';
  httpOnly?: boolean | 'all';
  secure?: boolean | 'all';
}

interface SigninOptions {
  jump?: boolean;
  [key: string]: any;
}

function hasContent(arr?: any[]) {
  return arr && arr.length > 0;
}

// tslint:disable-next-line:ban-types
function callable(fn: any): fn is Function {
  return typeof fn === 'function';
}

function warn(type: string, ...msgs: any[]) {
  console.warn(`[warning] [${type}]`, ...msgs);
}

class Client {
  public options!: ClientOptions;

  private _browser!: Browser;
  private _page!: Page;
  private _cookies: Cookie[] = [];
  private _events: EventsMap = {};

  constructor(options: ClientOptions) {
    this._initOption(options);
  }

  public async launch() {
    const opt = this.options;
    this._browser = await puppeteer.launch({ headless: !opt.debug });
    this._page = await this._browser.newPage();
  }

  public setOptions(opt: Partial<ClientOptions>) {
    this.options = {
      ...this.options,
      ...opt,
    };
  }

  public on<T extends keyof EventsMap>(eventname: T, cb: EventsMap[T]) {
    this._events[eventname] = cb;
  }

  public async signin(username: string, password: string, options: SigninOptions = {}) {
    const opt = this.options;
    const page = this._page;
    const args = [username, password, options];
    const { jump = true } = options;
    const mockSignin = async () => {
      await this._emit('readySignin', page, args);
      await this._callInput(page, opt.username, username);
      await this._callInput(page, opt.password, password);
      await this._emit('beforeSubmit', page, args);
      await this._callSubmit(page, opt.submit);
      await this._emit('beforeNavigation', page, args);
      if (jump) await page.waitForNavigation();
    };

    return new Promise(async (res, rej) => {
      const handler = (err: Error) => {
        this._handleError(err, rej);
        res({});
      };

      page.on('error', handler);

      page.on('load', async () => {
        try {
          await this.clearCookies();
          await mockSignin();
          this._cookies = await page.cookies();
          res(this.getCookiesMap());
        } catch (error) {
          handler(error);
        }
      });

      try {
        await page.goto(opt.signinUrl);
      } catch (error) {
        handler(error);
      }
    });
  }

  public hasCookies() {
    return hasContent(this._cookies);
  }

  public async clearCookies() {
    await this._page.setCookie();
    this._cookies = [];
  }

  public getCookiesMap(): { [key: string]: string | undefined } {
    const cookieList = this.getCookies();
    return cookieList.reduce((prev: any, cur) => {
      prev[cur.name] = cur.value;
      return prev;
    }, {});
  }

  public getCookies({
    domain = '.',
    path = '.',
    expired = 'all',
    httpOnly = 'all',
    secure = 'all',
  }: CookieFilter = {}): Cookie[] {
    const cookies = this._getCookies();
    const regDomain = typeof domain === 'string' ? new RegExp(domain) : domain;
    const regPath = typeof path === 'string' ? new RegExp(path) : path;
    const nowTime = Date.now();

    return cookies.filter((c) => (
      regDomain.test(c.domain) &&
      regPath.test(c.path) &&
      (httpOnly === 'all' ? true : c.httpOnly === httpOnly) &&
      (secure === 'all' ? true : c.secure === secure) &&
      expired === 'all' ? true : c.expires < nowTime === expired
    ));
  }

  public toJson() {
    const map = this.getCookiesMap();
    return JSON.stringify(map);
  }

  public toString(): string {
    const cookies = this._cookies;
    return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
  }

  public async close() {
    await this._page.close();
    await this._browser.close();
  }

  private _getCookies() {
    if (!hasContent(this._cookies)) {
      // const cookies = await this._page.cookies();
      // if (hasContent(cookies)) {
      //   this._cookies = cookies;
      // } else {
      warn('get cookies', 'please signin first.');
      return [];
      // }
    }
    return this._cookies;
  }

  private _initOption(opt: ClientOptions) {
    const defOptions = {
      debug: false,
    };

    this.options = {
      ...defOptions,
      ...opt,
    };
  }

  private async _callInput(page: Page, cfg: InputConfig, val: string) {
    if (callable(cfg)) {
      cfg.call(null, page, val);
    } else {
      const el = await page.$(cfg);
      if (el) {
        el.type(val, { delay: 1 });
      } else {
        warn('input type', 'can\'t find input element', cfg, page);
      }
    }
  }

  private async _callSubmit(page: Page, cfg: InputConfig) {
    if (callable(cfg)) {
      cfg.call(null, page);
    } else {
      const el = await page.$(cfg);
      if (el) {
        el.click({ delay: 1 });
      } else {
        warn('submit', 'can\'t find submit button element', cfg, page);
      }
    }
  }

  private async _emit(name: keyof EventsMap, ...args: any[]) {
    const fn = this._events[name];
    if (callable(fn)) {
      await fn.apply(this, args);
    }
  }

  private _handleError(err: Error, cb?: (e: Error) => void) {
    const handler = this._events.error;
    if (callable(handler)) {
      handler(err);
    } else if (callable(cb)) {
      cb(err);
    } else {
      throw err;
    }
  }
}

// tslint:disable-next-line:max-classes-per-file
class ProxyClient {
  constructor(options: ClientOptions) {
    const instance = new Client(options);

    const proxy = new Proxy(instance, {
      get(target, prop, receiver) {
        if (prop === 'launch' || prop === 'on') {
          return Reflect.get(target, prop).bind(target);
        } else if (!Reflect.get(target, '_browser') || !Reflect.get(target, '_page')) {
          Reflect.get(target, '_handleError', receiver).call(
            target,
            new Error('must launch browser first!'),
          );
          return () => { };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as Client;
    return proxy;
  }
}

// tslint:disable-next-line:no-empty-interface
interface ProxyClient extends Client {}

export default ProxyClient;
export { ClientOptions, CookieFilter, SigninOptions };
