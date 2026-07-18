# Guitar Chords

Application web pour guitaristes et bassistes : affiche **toutes les positions
jouables** d'un accord sur le manche (ex. CM7), avec diagrammes et écoute au
toucher. 100 % vanilla JS, **aucune dépendance**, aucun appel serveur,
installable sur smartphone (PWA), utilisable hors-ligne.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure de la page |
| `style.css` | Styles (mobile d'abord, adaptations tablette/desktop) |
| `engine.js` | Moteur : génération des voicings + analyse des noms d'accords (`parseChord`) |
| `app.js` | Interface : contrôles, diagrammes SVG, audio, accords enregistrés |
| `manifest.json` | Manifeste PWA (installation sur l'écran d'accueil) |
| `sw.js` | Service worker cache-first (hors-ligne) — **incrémenter `VERSION` à chaque mise à jour** |
| `icon-*.png` | Icônes 192/512 + variante *maskable* Android |
| `test.js`, `test-parse.js` | Tests du moteur et du parseur (`node test.js`) |

## Déploiement

### GitHub Pages (recommandé pour un compte personnel)

1. Créer le dépôt (ex. `manche`) et pousser les fichiers à la racine :

   ```bash
   git init && git add . && git commit -m "Manche v1"
   git branch -M main
   git remote add origin git@github.com:ericbrison/GuitarChords.git
   git push -u origin main
   ```

2. Sur GitHub : **Settings → Pages → Source : GitHub Actions**.
   Le workflow `.github/workflows/pages.yml` publie automatiquement le site
   à chaque push sur `main` (déclenchement manuel possible via l'onglet
   Actions → « Déployer sur GitHub Pages » → Run workflow).

3. L'app est servie en HTTPS sur `https://ericbrison.github.io/GuitarChords/` —
   tous les chemins du projet sont relatifs, le sous-chemin ne pose aucun
   problème (manifeste, service worker et icônes compris).

Installation sur smartphone : ouvrir cette URL dans Chrome/Safari →
« Ajouter à l'écran d'accueil ». L'app fonctionne ensuite sans réseau.

**Mise à jour** : après chaque push modifiant les fichiers, incrémenter la
version aux quatre endroits (le numéro affiché en pied de page permet de
vérifier ce qui tourne réellement sur un appareil) :
`VERSION` dans `sw.js`, `APP_VERSION` dans `app.js`, et les suffixes
`?vNN` des trois assets dans `index.html` (ils neutralisent le cache CDN
de GitHub Pages, source possible de versions panachées).

### Autre hébergement statique

N'importe quel serveur HTTPS convient :

```bash
rsync -av ./ user@serveur:/var/www/manche/
```

Test local : `php -S localhost:8000` ou `python3 -m http.server` — le SW
fonctionne aussi sur `localhost`.

## Moteur de voicings (résumé)

Pour chaque fenêtre de 4 cases sur le manche, chaque corde peut être étouffée,
à vide ou frettée sur une note de l'accord. Un voicing est retenu si :

- toutes les notes obligatoires sont présentes (la quinte juste est omissible,
  option activée par défaut pour les accords de 4 sons et plus) ;
- il est jouable : ≤ 4 doigts, écart ≤ 3 cases entre frettes, barré détecté
  automatiquement (aucune corde à vide/étouffée sous le barré), au plus une
  corde étouffée « interne » ;
- au moins 3 cordes jouées.

Les voicings redondants (même forme + cordes à vide en plus, même basse,
position ouverte) sont élagués. Tri : position sur le manche, puis score de
jouabilité (fondamentale à la basse, nb de doigts, écart, cordes jouées).

Accordages fournis : guitare standard, drop D, DADGAD, basse 4 et 5 cordes —
extensibles dans `TUNINGS` (midi des cordes à vide, grave → aigu).

## Outil gammes

L'onglet « Gammes » affiche une gamme sur tout le manche (manche horizontal,
défilement tactile, notes colorées par degré ou par note, toucher une note la
joue). Quatre orientations dans ⚙ : horizontal sillet à gauche ou à droite
(gauchers), vertical sillet en haut ou en bas (pratique en portrait, la page
défile le long du manche). 14 gammes prédéfinies (pentatoniques, blues, modes, mineures
harmonique/mélodique, tons entiers). Les 12 pastilles de degrés permettent de
personnaliser : sur la pentatonique mineure, toucher ♭5 ajoute la blue note.
Le bouton ★ enregistre la gamme sous le nom saisi (localStorage, groupe
« ★ Mes gammes », transposable) ; gestion dans ⚙. Une gamme personnalisée est
partageable par URL (`#tool=s&g=custom&gi=0,3,5,6,7,10&gn=…`).

## Accords libres et accords enregistrés

Le champ « Accord libre » accepte n'importe quel nom : `CM7add11`,
`F♯m7♭5/A`, `Bb13`, `C6/9`, `G7♯9`, `Cadd9`, `CmM7`, `C5`, `E7sus4`…
Grammaire reconnue : qualité (m, dim/°, aug/+, ø), septièmes (7, M7/maj7/Δ),
extensions empilées (9, 11, 13 — les notes intermédiaires deviennent
omissibles), sixtes (6, 6/9), suspensions (sus2, sus4), ajouts
(`add9`, `add11`, `add♯11`…), altérations (`♭5`, `♯5`, `♭9`, `♯9`, `♯11`,
`♭13`), omissions (`no3`, `no5`) et basse imposée (`/E`).

Le bouton ★ enregistre le **type** d'accord (pas la fondamentale) : un
`M7add11` sauvegardé apparaît dans le sélecteur sous « ★ Mes accords » et se
transpose sur les 12 fondamentales. Stockage en `localStorage` (local à
l'appareil, survit hors-ligne). Gestion/suppression dans le panneau ⚙.

## Position sur le manche

Un double slider sous les contrôles filtre les positions par plage de cases
(deux poignées min/max, graduation aux cases repères, ✕ pour revenir au
manche entier). Les cordes à vide ne sont admises que si la plage démarre au
sillet. La plage est portée par l'URL (`#fm=5&fx=8`).

## État partageable

La sélection est reflétée dans l'URL : `#r=0&t=maj7&a=guitar-std` (fondamentale, type, accordage) ou
`#c=CM7add11&a=guitar-std` pour un accord libre. Un lien copié rouvre le
même accord.
