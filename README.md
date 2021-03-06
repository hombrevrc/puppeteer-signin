# puppeteer-signin

[![Build Status](https://travis-ci.org/Hental/puppeteer-signin.svg?branch=master)](https://travis-ci.org/Hental/puppeteer-signin)
[![Coveralls](https://img.shields.io/coveralls/Hental/puppeteer-signin.svg)](https://coveralls.io/github/Hental/puppeteer-signin)

use puppeteer to sign in and get cookies

## install

```shell
npm install puppeteer-signin
// or
yarn add puppeteer-signin
```

## example

```js
import Client from 'puppeteer-signin';
// const Client = require('puppeteer-signin').default;

const client = new Client({
  signinUrl: 'http://example/path/to/signin',
  username: 'selector',
  password: 'selector',
  submit: 'selector',
});

(async function main(){
  await client.launch(); // must launch first
  await client.signin('username', 'password');
  const cookies = client.getCookies();
  await client.close(); // should close it if you won't use
  console.log(cookies);
})()
```

## api
