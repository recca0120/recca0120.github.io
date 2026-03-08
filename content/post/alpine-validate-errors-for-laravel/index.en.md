---
title: 'Alpine.js Plugin for Laravel AJAX Validation Errors'
description: 'Build an Alpine.js errors plugin that mirrors the Laravel MessageBag API, so 422 AJAX validation errors display just as easily as the @error directive.'
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

When Laravel validation fails on a regular form submission, you can use the `@error` directive in Blade to display errors. But for AJAX requests, Laravel returns errors in JSON format, and you need to handle the frontend display yourself.

## Blade's @error Only Works for Synchronous Forms

The typical approach:

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

But when the request is AJAX, Laravel returns JSON:

```json
{
  "errors": {
      "email": ["The email field must be a valid email address."],
      "name": ["The name field is required."]
  },
  "message": "The name field is required. (and 1 more error)"
}
```

To avoid having to learn a separate frontend error handling approach, I wrote an [Alpine.js](https://alpinejs.dev) plugin that provides an API similar to Laravel's `MessageBag`.

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

By using `registerAxiosInterceptor` to hook into Axios interceptors, errors are automatically populated into the `MessageBag` on a 422 response and automatically cleared when a new request is sent.

## Initialization

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

## Usage in Blade

Inside an Alpine component, you can use the `$errors` magic property directly, similar to Laravel's Blade `@error`:

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

## Testing

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
