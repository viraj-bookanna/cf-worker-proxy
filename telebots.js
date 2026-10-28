export default {
    async fetch(request, env) {
        // Decrypt a single AES-CBC block (no padding) fully inside the Worker,
        // reproducing: AES.new(key, MODE_CBC, iv).decrypt(ct).hex()
        // Web Crypto's AES-CBC enforces PKCS#7 padding, so we append a crafted
        // second block whose plaintext is a full 0x10 padding block; Web Crypto
        // strips it and returns only the real decrypted block.
        async function aesCbcDecryptBlockHex(keyHex, ivHex, ctHex) {
            const hexToBytes = h => Uint8Array.from(h.match(/../g).map(x => parseInt(x, 16)));
            const bytesToHex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
            const keyBytes = hexToBytes(keyHex);
            const iv = hexToBytes(ivHex);
            const ct = hexToBytes(ctHex); // single 16-byte block

            const encKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
            const decKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['decrypt']);

            // Craft C2 so that Dec(C2) XOR ct == 0x10*16 (a full PKCS#7 pad block).
            // => Dec(C2) = ct XOR pad => C2 = Enc(ct XOR pad).
            // Enc via AES-CBC with IV=0 yields Enc(block) as its first 16 bytes.
            const blockToEnc = new Uint8Array(16);
            for (let i = 0; i < 16; i++) blockToEnc[i] = ct[i] ^ 0x10;
            const encOut = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, encKey, blockToEnc));
            const c2 = encOut.slice(0, 16);

            const combined = new Uint8Array(32);
            combined.set(ct, 0);
            combined.set(c2, 16);

            const ptBuf = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, decKey, combined);
            return bytesToHex(ptBuf); // 16 bytes hex, == python's retval
        }
        async function decode_captcha(html) {
            var pattern = /var a=toNumbers\("([0-9a-f]{32})"\),b=toNumbers\("([0-9a-f]{32})"\),c=toNumbers\("([0-9a-f]{32})"\);document\.cookie="([^"]+?)"/,
                pattern2 = /document\.cookie="([^"]+?)"/,
                m = html.match(pattern),
                m2 = html.match(pattern2);
            if (m) {
                var hex = await aesCbcDecryptBlockHex(m[1], m[2], m[3]);
                return m[4] + hex;
            } else if (m2) {
                return m2[1];
            }
            return false;
        }
        async function getPostData(request) {
            try {
                return await request.formData();
            } catch (e) {
                return new FormData();
            }
        }
        async function toTelegram() {
            var url = new URL(request.url);
            const HOST_NAME = url.hostname;
            const option = url.pathname.split('/')[2];
            var data = await getPostData(request);
            url.hostname = "api.telegram.org";
            if (option.toUpperCase() == 'setWebhook'.toUpperCase()) {
                if (data.get("url") != null) {
                    data.set("url", "https://" + HOST_NAME + "/webhook?url=" + data.get("url"));
                }
                if (url.searchParams.get("url") != null) {
                    url.searchParams.set("url", "https://" + HOST_NAME + "/webhook?url=" + url.searchParams.get("url"));
                }
            }
            var req_options = {
                method: request.method,
            }
            if (request.method.toUpperCase() == 'POST') {
                req_options['body'] = data;
            }
            var response = await fetch(url, req_options);
            if(/\/file\/bot[a-zA-Z0-9:\-_]*\/[a-zA-Z0-9]*/g.test(url.pathname)){
                return response;
            }
            if (option.toUpperCase() == 'getWebhookInfo'.toUpperCase()) {
                response = await response.json()
                response['result']['url'] = response['result']['url'].replace("https://" + HOST_NAME + "/webhook?url=", '')
                response = JSON.stringify(response)
            } else {
                response = await response.text()
            }
            return new Response(response, {
                headers: {
                    'Content-Type': 'text/plain'
                }
            })
        }
        async function fromTelegram() {
            var url = new URL(request.url);
            var req_options = {
                method: request.method,
                body: await request.text(),
            }
            var response = await fetch(url.searchParams.get('url'), req_options);
            if (url.searchParams.get('url').indexOf('.rf.gd') != -1) {
                const responseClone = response.clone();
                var cookie = await decode_captcha(await response.text());
                if (cookie) {
                    req_options.headers = 'undefined' == typeof req_options.headers ? {} : req_options.headers;
                    req_options.headers.cookie = 'undefined' == typeof req_options.headers.cookie ? cookie : req_options.headers.cookie;
                    response = await fetch(url.searchParams.get('url'), req_options);
                }
                else {
                    response = responseClone;
                }
            }
            return new Response(await response.text(), {
                headers: {
                    'Content-Type': 'application/json'
                }
            })
        }
        var url = new URL(request.url);
        if (/\/bot[a-zA-Z0-9:\-_]*\/[a-zA-Z0-9]*/g.test(url.pathname)) {
            return await toTelegram();
        } else if (/\/webhook/g.test(url.pathname) && url.searchParams.get('url') != null) {
            return await fromTelegram();
        } else {
            return new Response('NOT FOUND', {
                headers: {
                    'Content-Type': 'text/plain'
                }
            })
        }
    }
}