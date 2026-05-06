# Deployer Vortap sur Render

Objectif: obtenir une URL stable pour les clients, puis brancher `qr.vortap.fr`.

## 1. Creer le service Render

Dans Render:

1. Cliquer sur **New +**.
2. Choisir **Blueprint**.
3. Connecter ce repo GitHub: `vortap57/vortap-qr`.
4. Render lit automatiquement `render.yaml`.
5. Valider la creation du service `vortap-qr`.

La configuration inclut:

- runtime Node;
- `NODE_VERSION=22.22.0`;
- `HOST=0.0.0.0`;
- `DATA_DIR=/var/data`;
- disque persistant de 1 GB;
- health check `/health`.

## 2. Tester l'URL Render

Render donne une URL du type:

```text
https://vortap-qr.onrender.com
```

Tester:

```text
https://vortap-qr.onrender.com/health
```

La reponse doit etre:

```text
ok
```

## 3. Brancher le domaine Vortap

Dans Render, ouvrir le service `vortap-qr`, puis:

1. Aller dans **Settings**.
2. Ouvrir **Custom Domains**.
3. Ajouter `qr.vortap.fr`.
4. Render affichera la cible DNS a configurer.
5. Dans le DNS de `vortap.fr`, creer le CNAME demande par Render.
6. Revenir dans Render et cliquer sur **Verify**.

Render active automatiquement HTTPS.
