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
        if (request.method.toUpperCase() == 'OPTIONS') {
            return new Response('', {
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }
        try {
            var reqdata = request.headers.get("content-type")=="application/json" ? await request.json() : null,
                pattern = /fetch\("([^"]+)", (\{.+})\);/s,
                url = new URL(request.url),
                data = reqdata==null ? await getPostData(request) : new FormData();
            if (url.searchParams.get("reqdata") != null || data.get("reqdata") != null) {
                reqdata = JSON.parse(url.searchParams.get("reqdata") ?? data.get("reqdata"));
            }
            if (reqdata != null) {
                var resp = fetch(reqdata['url'], reqdata['options']);
                if (reqdata['url'].indexOf('.rf.gd') != -1) {
                    resp = await resp;
                    const respClone = resp.clone();
                    var cookie = await decode_captcha(await resp.text());
                    if (cookie) {
                        reqdata.options = 'undefined' == typeof reqdata.options ? {} : reqdata.options;
                        reqdata.options.headers = 'undefined' == typeof reqdata.options.headers ? {} : reqdata.options.headers;
                        reqdata.options.headers.cookie = 'undefined' == typeof reqdata.options.headers.cookie ? cookie : reqdata.options.headers.cookie;
                        resp = fetch(reqdata['url'], reqdata['options']);
                    }
                    else{
                        resp = respClone;
                    }
                }
                if (url.searchParams.get("unblock_cors") != null) {
                    resp = await resp;
                    resp = new Response(resp.body, resp);
                    resp.headers.set('Access-Control-Allow-Origin', '*');
                }
                return resp;
            } else if (data.get("fetchdata") == null || !pattern.test(data.get("fetchdata"))) {
                var form = `
<form method="post">
    <textarea name="fetchdata"></textarea><br>
    <input type="submit" value="do request"></input>
</form>
`;
                return new Response(form, {
                    headers: {
                        'Content-Type': 'text/html'
                    }
                });
            }
            var m = data.get("fetchdata").match(pattern);
            reqdata = {
                url: m[1],
                options: JSON.parse(m[2])
            };
            var link = 'https://' + url.hostname + '/?reqdata=' + encodeURIComponent(JSON.stringify(reqdata));
            return new Response(`<a href="${link}" target="_blank">REQUEST LINK</a>`, {
                headers: {
                    'Content-Type': 'text/html'
                }
            });
        } catch (e) {
            return new Response(e.toString(), {
                headers: {
                    'Content-Type': 'text/html'
                }
            });
        }
    }
}