---
title: '用 Alpine.js 處理 Laravel AJAX 驗證錯誤'
description: '為 Alpine.js 寫 errors plugin 仿照 Laravel MessageBag API，讓 AJAX 表單 422 驗證錯誤像 @error directive 一樣顯示。'
slug: alpine-validate-errors-for-laravel
date: '2024-04-19T09:30:26+08:00'
categories:
- Frontend
- Laravel
tags:
- Alpine.js
- Laravel
- JavaScript
- Validation
image: featured.jpg
draft: false
---

Laravel validation 失敗時，如果是一般表單提交，可以在 Blade 裡用 `@error` directive 顯示錯誤。但如果是 AJAX request，Laravel 會回傳 JSON 格式的錯誤，需要自己處理前端顯示。

## Blade 的 @error 只適用同步表單

一般的寫法：

```blade
<label for="email">Email</label>

<input id="title"
    type="email"
    name="email"
    class="@error('email') is-invalid @enderror">

@error('email')
    <div class="alert alert-danger">{{ $message }}</div>
@enderror
```

但當 request 是 AJAX 時，Laravel 回傳的是 JSON：

```json
{
  "errors": {
      "email": ["The email field must be a valid email address."],
      "name": ["The name field is required."]
  },
  "message": "The name field is required. (and 1 more error)"
}
```

為了不用另外記一套前端錯誤處理方式，我直接幫 [Alpine.js](https://alpinejs.dev) 寫了一個 plugin，讓前端也能用類似 Laravel `MessageBag` 的 API。

## Alpine.js errors plugin

```javascript
// errors.js
class MessageBag {
    constructor(errors = {}) {
        this.errors = errors;
    }

    set(key, value) {
        return this.put(key, value);
    }

    put(key, value) {
        const values = typeof key === 'object' ? key : {[key]: value};

        for (const x in values) {
            let val = values[x];

            this.errors[x] = typeof val === 'string' ? [val] : val;
        }

        return this;
    }

    get(key) {
        if (!this.errors.hasOwnProperty(key) || !this.errors[key]) {
            this.put(key, null);
        }

        return this.errors[key];
    }

    has(key) {
        return this.get(key) !== null;
    }

    first(key) {
        if (!this.has(key)) {
            return null;
        }

        const value = this.get(key);

        return value instanceof Array ? value[0] : value;
    }

    remove(...keys) {
        keys.forEach(key => this.put(key, null));
    }

    clear() {
        this.remove(...Object.keys(this.errors));
    }

    all() {
        return Object.keys(this.errors).reduce((acc, key) => {
            const value = this.get(key);

            return value === null ? acc : {...acc, [key]: value};
        }, {});
    }

    registerAxiosInterceptor(axios) {
        const beforeRequest = (config) => {
            this.clear();

            return config;
        };
        const onError = (err) => {
            const {status, data} = err.response;

            if (status === 422) {
                this.set(data.errors);
            }

            return Promise.reject(err);
        };

        axios.interceptors.request.use(beforeRequest, err => Promise.reject(err));
        axios.interceptors.response.use(response => response, onError);
    }
}

export default function (Alpine) {
    const errors = Alpine.reactive(new MessageBag({}));
    Alpine.magic('errors', () => errors);
    Object.defineProperty(Alpine, 'errors', {get: () => errors});
}
```

透過 `registerAxiosInterceptor` 掛上 Axios interceptor，422 回應時自動把 errors 塞進 `MessageBag`，發送新 request 時自動清除。

## 初始化

```javascript
// bootstrap.js
import Alpine from 'alpinejs';
import Axios from 'axios';
import errors from './errors';

errors(Alpine);
Alpine.start();

window.axios = Axios.create();
window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
Alpine.errors.registerAxiosInterceptor(window.axios);
```

## 在 Blade 裡使用

在 Alpine component 裡可以直接用 `$errors` magic property，跟 Laravel 的 Blade `@error` 用法很像：

```blade
<div x-data>
    <input type="text" name="email"
           :class="{'text-red-900': $errors.has('email')}"
           @keyup="$errors.remove('email')">

    <template x-if="$errors.has('email')">
        <p x-text="$errors.first('email')" class="text-red-600"></p>
    </template>
</div>
```

## 測試

```javascript
// errors.test.js
import { fireEvent, screen } from '@testing-library/dom';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import Alpine from 'alpinejs';
import plugin from './errors';

describe('Alpine $errors', () => {
    const givenComponent = (name) => {
        const component = document.createElement('div');
        component.innerHTML = `
            <div x-data>
                <div>
                    <label for="${name}">${name}</label>
                    <div>
                        <input type="text" name="${name}" id="${name}"
                               :class="{'text-red-900': $errors.has('${name}')}"
                               @keyup="$errors.remove('${name}')"
                               role="input">
                    </div>

                    <template x-if="$errors.has('${name}')">
                        <p x-text="$errors.first('${name}')" role="error-message"></p>
                    </template>
                </div>
            </div>
        `;
        document.body.append(component);

        return component;
    };

    beforeAll(() => {
        plugin(Alpine);

        const mock = new MockAdapter(axios);
        mock.onPost('/users').reply(422, {
            'message': 'The email field must be a valid email address.',
            'errors': {'email': ['The email field must be a valid email address.']},
        });
        Alpine.$errors.registerAxiosInterceptor(axios);

        Alpine.start();
    });

    afterAll(() => Alpine.stopObservingMutations());

    beforeEach(() => {
        document.body.innerHTML = '';
        givenComponent('email');
        givenComponent('password');
    });

    afterEach(() => document.body.innerHTML = '');

    const getInvalidInputs = () => screen.queryAllByRole('input').filter(el => el.classList.contains('text-red-900'));
    const getErrorMessages = () => screen.queryAllByRole('error-message');

    async function expectShowError() {
        try {
            await axios.post('/users');
        } catch (e) {
        }

        expect(getInvalidInputs()).toHaveLength(1);
        expect(getErrorMessages()).toHaveLength(1);
        expect(getErrorMessages()[0].innerHTML).toContain('The email field must be a valid email address.');
    }

    it('show errors', async () => {
        await expectShowError();
    });

    it('clear errors', async () => {
        await expectShowError();

        await Alpine.nextTick(() => Alpine.$errors.clear());

        expect(getInvalidInputs()).toHaveLength(0);
        expect(getErrorMessages()).toHaveLength(0);
    });

    it('key up clear input error', async () => {
        await expectShowError();

        const invalidInput = getInvalidInputs()[0];
        await Alpine.nextTick(() => fireEvent.keyUp(invalidInput));

        expect(invalidInput.classList).not.toContain('text-red-900');
    });
});
```

## 參考資源

- [Alpine.js 官方文件 — Plugins](https://alpinejs.dev/advanced/extending)
- [Laravel 驗證回傳格式說明](https://laravel.com/docs/validation#validation-error-response-format)
- [Laravel MessageBag API 文件](https://laravel.com/docs/errors#validation-exceptions)
- [Axios Interceptors 官方說明](https://axios-http.com/docs/interceptors)
- [axios-mock-adapter GitHub](https://github.com/ctimmerm/axios-mock-adapter)
