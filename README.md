# Vortap QR dynamique

Application Vortap pour creer, gerer et rediriger des QR codes dynamiques.

## Deploiement Render

Ce depot est pret pour Render avec `render.yaml`.

1. Ouvrir Render.
2. Cliquer sur **New +**.
3. Choisir **Blueprint**.
4. Connecter ce depot GitHub: `vortap57/vortap-qr`.
5. Valider la creation du service `vortap-qr`.
6. Tester `/health` sur l'URL Render.

## Domaine final

Quand le service Render fonctionne, brancher le domaine:

```text
https://qr.vortap.fr
```

Les QR dynamiques utilisent ensuite des liens du type:

```text
https://qr.vortap.fr/r/identifiant
```
