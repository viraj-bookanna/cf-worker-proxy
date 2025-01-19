export default {
    async fetch(request, env) {
        async function decode_captcha(html) {
            var pattern = /var a=toNumbers\("([0-9a-f]{32})"\),b=toNumbers\("([0-9a-f]{32})"\),c=toNumbers\("([0-9a-f]{32})"\);document\.cookie="([^"]+?)"/,
                pattern2 = /document\.cookie="([^"]+?)"/,
                m = html.match(pattern),
                m2 = html.match(pattern2);
            if (m) {
                var py = encodeURIComponent(`
from Crypto.Cipher import AES
cipher = AES.new(bytes.fromhex('${m[1]}'), AES.MODE_CBC, bytes.fromhex('${m[2]}'))
retval=cipher.decrypt(bytes.fromhex('${m[3]}')).hex()
`.trim());
                var resp = await fetch("https://remotexec.pythonanywhere.com/", {
                    "headers": {
                        "content-type": "application/x-www-form-urlencoded",
                    },
                    "body": `code=${py}&pass=__FUCK`,
                    "method": "POST"
                });
                return m[4] + (await resp.text());
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
            var reqdata,
                pattern = /fetch\("([^"]+)", (\{.+})\);/s,
                url = new URL(request.url),
                data = await getPostData(request);
            if (url.searchParams.get("reqdata") != null || data.get("reqdata") != null) {
                reqdata = JSON.parse(url.searchParams.get("reqdata") ?? data.get("reqdata"));
                var resp = fetch(reqdata['url'], reqdata['options']);
                if (reqdata['url'].indexOf('.rf.gd') != -1) {
                    resp = await resp;
                    var cookie = await decode_captcha(await resp.text());
                    if (cookie) {
                        reqdata.options = 'undefined' == typeof reqdata.options ? {} : reqdata.options;
                        reqdata.options.headers = 'undefined' == typeof reqdata.options.headers ? {} : reqdata.options.headers;
                        reqdata.options.headers.cookie = 'undefined' == typeof reqdata.options.headers.cookie ? cookie : reqdata.options.headers.cookie;
                        resp = fetch(reqdata['url'], reqdata['options']);
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