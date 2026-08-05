# Sicherheits-Header

Zwei Befunde der Prüfstrecke lassen sich **nicht** im Repository lösen:
HSTS und eine CSP als echter HTTP-Header. GitHub Pages liefert nur eine feste
Liste eigener Header aus und bietet keine Möglichkeit, weitere zu setzen —
keine `_headers`-Datei, keine Konfiguration, keine Action.

Stand heute (`curl -I https://klinkerbox.ch/`):

```
Server: GitHub.com
Cache-Control: max-age=600
Access-Control-Allow-Origin: *
```

Kein `Strict-Transport-Security`, kein `Content-Security-Policy`.
Umleitung von http auf https besteht (301, „Enforce HTTPS" ist aktiv).

---

## Was bereits gelöst ist

Die CSP liegt als `<meta http-equiv="Content-Security-Policy">` in
`index.html`, `impressum/`, `datenschutz/` und `404.html`. Browser setzen sie
genauso durch wie einen Header — nachgewiesen im Browser: ein nachträglich
eingeschleustes `<script>` wird nicht ausgeführt (`script-src-elem`), eine
Verbindung zu einer fremden Adresse wird blockiert (`connect-src`).

Zwei Einschränkungen der Meta-Variante:

- `frame-ancestors` wird im Meta-Tag ignoriert. Die Seite lässt sich damit
  weiterhin in einen fremden Rahmen einbetten (Clickjacking).
- `Strict-Transport-Security` gibt es als Meta-Tag gar nicht. Die allererste
  Anfrage eines Besuchers, der `klinkerbox.ch` ohne `https://` eintippt, geht
  weiterhin unverschlüsselt raus, bevor die 301-Umleitung greift.

Beides braucht einen vorgelagerten Dienst.

---

## Weg über Cloudflare (kostenloser Tarif genügt)

Voraussetzung: Zugriff auf die Domainverwaltung von `klinkerbox.ch`.
Die Nameserver werden auf Cloudflare umgestellt — **das ist eine Änderung an
der Domain des Kunden und braucht seine ausdrückliche Zustimmung.**

1. **Domain aufnehmen.** Cloudflare-Konto anlegen, `klinkerbox.ch` hinzufügen,
   die importierten DNS-Einträge mit dem heutigen Bestand vergleichen
   (A-Einträge auf die vier GitHub-Pages-Adressen, CNAME `www`, MX-Einträge
   der Mail — **die MX-Einträge unbedingt prüfen, sonst steht die Post still**).
2. **Nameserver umstellen** beim heutigen Registrar. Übernahme dauert je nach
   Registrar wenige Minuten bis 24 Stunden.
3. **SSL/TLS → Übersicht → «Full (strict)».** GitHub Pages liefert für die
   eigene Domain ein gültiges Zertifikat, «Flexible» wäre hier falsch und
   würde eine Umleitungsschleife erzeugen.
4. **SSL/TLS → Edge Certificates → HSTS aktivieren.**
   Erst mit `max-age` = 6 Monate, ohne `includeSubDomains`, ohne Preload.
   Nach ein paar Wochen ohne Beanstandung auf 12 Monate erhöhen.
5. **Rules → Transform Rules → Modify Response Header → Set static.**
   Die Header aus dem nächsten Abschnitt eintragen.

### Warnung zu HSTS

HSTS ist die einzige Einstellung hier, die sich nicht sofort zurücknehmen
lässt. Browser merken sich die Anweisung für die volle `max-age`-Dauer. Wäre
die Seite später einmal nur über http erreichbar, kämen diese Besucher nicht
mehr durch — bis die Frist abgelaufen ist. Darum kurz anfangen und **Preload
nicht** einschalten: aus der Preload-Liste kommt man nur über einen Antrag und
mit Monaten Verzögerung wieder heraus.

---

## Die Header

```
Strict-Transport-Security: max-age=15552000
```

```
Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; font-src 'self'; connect-src 'self' https://api.web3forms.com; frame-src https://www.youtube-nocookie.com; form-action 'self'; frame-ancestors 'none'
```

Identisch mit dem Meta-Tag, ergänzt um `frame-ancestors 'none'`.

Sinnvolle Ergänzung, von der Prüfstrecke nicht verlangt, aber Standard:

```
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### Woher die Quellen kommen

| Eintrag | Wofür |
|---|---|
| `script-src 'self'` | nur eigene Skripte, **kein** Inline-JavaScript — der eigentlich schützende Teil |
| `style-src 'unsafe-inline'` | `style="…"`-Attribute in Markup und in den Vorlagen von `app.js` |
| `img-src data: blob:` | Texturen und PNG-Export des 3D-Konfigurators |
| `https://i.ytimg.com` | Vorschaubilder der Referenzfilme |
| `https://www.youtube-nocookie.com` | Player, wird erst beim Klick geladen |
| `https://api.web3forms.com` | Ziel von Kontaktformular und Newsletter |

`style-src 'unsafe-inline'` ist eine bewusste Abwägung: Die Seite arbeitet an
vielen Stellen mit Inline-Stilen (Hintergrundbilder der Karten, Farbpunkte,
Konfigurator). Sie alle auszubauen wäre ein grosser Eingriff mit Regressions-
risiko, während der Sicherheitsgewinn klein ist — Angriffe laufen praktisch
immer über Skripte, und die sind gesperrt.

---

## Wenn die Header stehen

Das Meta-Tag kann drin bleiben. Gelten dann zwei Richtlinien, setzt der
Browser die **Schnittmenge** durch; da beide identisch sind, ändert sich
nichts. Es dient als Rückfall, falls Cloudflare später wieder entfernt wird.

Danach prüfen:

```bash
curl -I https://klinkerbox.ch/ | grep -i "strict-transport\|content-security"
```

Und die Prüfstrecke neu laufen lassen:

```bash
python webcheck.py klinkerbox.ch -o berichte/klinkerbox-nachher
```

Erwartung: **0 von 100**.

---

## Alternative ohne Nameserver-Wechsel

Falls der Kunde die Domain nicht zu Cloudflare geben will, bleibt nur ein
Hosterwechsel weg von GitHub Pages. Netlify und Cloudflare Pages lesen beide
eine `_headers`-Datei direkt aus dem Repository:

```
/*
  Strict-Transport-Security: max-age=15552000
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
```

Das ist technisch der sauberere Weg — dieselbe statische Seite, dieselbe
Bereitstellung aus Git, nur ein Anbieter, der Header zulässt. Kostet nichts,
bedeutet aber eine Umstellung der DNS-Einträge und einen neuen Anbieter im
Datenschutz-Text (Abschnitt 4 nennt heute GitHub Pages).
