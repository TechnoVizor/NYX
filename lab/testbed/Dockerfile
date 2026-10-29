# NYX lab target. The certificate is made at build time, so no private key lives in the repository.
# Self-signed on purpose: tlsx reports it. The extra SAN name shows discovery from certificates.
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl \
 && openssl req -x509 -newkey rsa:2048 -nodes -days 365 -subj "/CN=testbed.nyx-lab.test" \
      -addext "subjectAltName=DNS:testbed.nyx-lab.test,DNS:admin.nyx-lab.test" \
      -keyout /etc/nginx/lab.key -out /etc/nginx/lab.crt \
 && apk del openssl
