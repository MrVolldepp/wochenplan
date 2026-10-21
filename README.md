# Wochenplan

Deine Aufgaben als Wochenplan: am PC als Balken über die Tage, am Handy als Tagesliste mit Wochenleiste. Die App läuft offline. Sobald Internet da ist, gleicht sie sich über eine Datei in deinem OneDrive ab.

Ohne Einrichtung läuft die App sofort, speichert dann aber nur auf dem jeweiligen Gerät. Für den Abgleich zwischen Handy und PC sind die Schritte unten nötig, einmalig etwa 30 Minuten.

---

## Überblick: was du einrichtest

1. **GitHub Pages**: Darüber ist die App im Internet erreichbar (kostenlos). Microsoft verlangt für die Anmeldung eine feste https-Adresse.
2. **App bei Microsoft registrieren**: Damit erhält die App die Erlaubnis, in *dein* OneDrive zu schreiben. Dabei bekommst du eine Client-ID.
3. **Client-ID eintragen**: in die Datei `config.js`.
4. **Am PC und am Handy öffnen und anmelden.**

Deine Aufgaben liegen nur in deinem OneDrive (`OneDrive/Wochenplan/aufgaben.json`) und auf deinen Geräten, nicht bei GitHub.

---

## Schritt 1: App bei GitHub Pages hochladen

1. Kostenloses Konto auf [github.com](https://github.com) anlegen, falls noch keins vorhanden.
2. Oben rechts **+** → **New repository**.
   - Repository name: `wochenplan`
   - **Public** auswählen (der Code ist öffentlich, deine Aufgaben nicht)
   - **Create repository**
3. Auf der neuen Seite auf **uploading an existing file** klicken.
4. Den **Inhalt** des entpackten Ordners `wochenplan` in das Fenster ziehen: alle Dateien **und** die Ordner `fonts`, `icons` und `vendor`. Unten auf **Commit changes** klicken.
5. Im Repository **Settings** → links **Pages**:
   - Source: **Deploy from a branch**
   - Branch: **main**, Ordner **/ (root)** → **Save**
6. Nach etwa einer Minute steht oben auf derselben Seite deine Adresse, z. B.
   `https://DEIN-NAME.github.io/wochenplan/`

Öffne die Adresse am PC. Die App sollte erscheinen, oben steht „Nur auf diesem Gerät“. **Diese Adresse brauchst du in Schritt 2 genau so, mit `/` am Ende.**

---

## Schritt 2: App bei Microsoft registrieren

### 2a: Zugang zum Registrieren

Öffne [entra.microsoft.com](https://entra.microsoft.com) und melde dich mit deinem **privaten Microsoft-Konto** an, also dem Konto mit deinem OneDrive. Dann **App-Registrierungen** öffnen und **Neue Registrierung** wählen. Den Menüpunkt findest du am schnellsten über die Suche oben, englisch heißt er *App registrations*.

- **Klappt das**: weiter mit 2b.
- **Meldung, dass das Erstellen von Anwendungen außerhalb eines Verzeichnisses nicht mehr möglich ist** (englisch: *„The ability to create applications outside of a directory has been deprecated“*): Seit 2025 braucht ein privates Konto dafür ein Azure-Verzeichnis. Das bekommst du kostenlos und ohne Kreditkarte über **Azure for Students**:
  1. [azure.microsoft.com/free/students](https://azure.microsoft.com/free/students/) öffnen → Konto aktivieren.
  2. Am besten mit deinem **privaten Microsoft-Konto** anmelden. Die **Uni-Mailadresse** dient zur Bestätigung deines Studierendenstatus.
  3. Nach der Aktivierung ein paar Minuten warten. Danach [entra.microsoft.com](https://entra.microsoft.com) neu öffnen, dann geht die Registrierung.

  Azure for Students kostet nichts. Du legst dort nichts an außer dieser Registrierung, die selbst kostenlos ist.

  Die Registrierung muss nicht im selben Konto liegen wie dein OneDrive. Klappt Azure for Students nur mit dem Uni-Konto, registrierst du die App eben dort. In der App meldest du dich später trotzdem mit deinem privaten Konto an.

### 2b: Registrierung ausfüllen

- **Name**: `Wochenplan`
- **Unterstützte Kontotypen**: **Nur persönliche Microsoft-Konten** (englisch: *Personal Microsoft accounts only*)
- **Umleitungs-URI**: Plattform **Single-Page-Anwendung (SPA)** (englisch: *Single-page application*), Adresse **deine GitHub-Adresse aus Schritt 1**, z. B. `https://DEIN-NAME.github.io/wochenplan/`
- **Registrieren**

### 2c: Berechtigung und Client-ID

1. Links **API-Berechtigungen** → **Berechtigung hinzufügen** → **Microsoft Graph** → **Delegierte Berechtigungen** → `Files.ReadWrite` anhaken → **Berechtigungen hinzufügen**.
2. Links **Übersicht**: Die **Anwendungs-ID (Client)** kopieren. Sie sieht etwa so aus: `1a2b3c4d-1234-5678-9abc-def012345678`.

Ein Client-Geheimnis ist **nicht** nötig.

---

## Schritt 3: Client-ID eintragen

1. Bei GitHub in deinem Repository die Datei **config.js** öffnen → Stift-Symbol (**Edit**).
2. Die Client-ID zwischen die Anführungszeichen setzen:
   ```js
   clientId: "1a2b3c4d-1234-5678-9abc-def012345678",
   ```
3. **Commit changes**. Etwa eine Minute warten, bis GitHub die neue Version ausliefert.

---

## Schritt 4: Anmelden und aufs Handy holen

**Am PC**
1. Die Adresse öffnen und neu laden. Oben steht jetzt „Nicht angemeldet“.
2. Zahnrad → **Mit Microsoft anmelden** → privates Konto wählen → Zugriff erlauben.
3. Oben steht „Abgeglichen“. In deinem OneDrive liegt jetzt `Wochenplan/aufgaben.json`.
4. Tipp: In Chrome oder Edge über das Symbol in der Adresszeile **App installieren**. Dann läuft der Wochenplan in einem eigenen Fenster.

**Am Handy (Android, Chrome)**
1. Die Adresse in Chrome öffnen.
2. Menü **⋮** → **App installieren** (oder **Zum Startbildschirm hinzufügen**).
3. Die App über das neue Symbol starten → Zahnrad → **Mit Microsoft anmelden**.

---

## Bedienung

- **Neue Aufgabe**: Knopf oben rechts (am PC auch Taste `N`).
- **Abhaken**: auf den Kreis tippen. Erledigte Aufgaben rutschen ausgegraut nach unten.
- **Bearbeiten oder löschen**: auf die Aufgabe tippen. Nach dem Löschen gibt es ein paar Sekunden lang **Rückgängig**.
- **Am Handy**: oben den Tag antippen oder in der Liste nach links oder rechts wischen.
- **Überfällige Aufgaben** stehen ganz oben und laufen rot schraffiert bis heute weiter, bis du sie abhakst.
- **Wiederkehrende Aufgaben** (täglich, wöchentlich, monatlich) hakst du pro Termin ab. Bearbeiten ändert alle Wiederholungen. Bei täglich müssen Start und Fällig auf denselben Tag fallen.
- **Einstellungen** (Zahnrad):
  - Aufgaben, die heute oder morgen fällig sind, automatisch bei „Kurzfristig“ einsortieren
  - Erledigte ein- oder ausblenden
  - Sicherung als Datei

## Wie der Abgleich funktioniert

- Jede Änderung wird sofort auf dem Gerät gespeichert, auch offline.
- Ist Internet da, lädt die App die OneDrive-Datei, führt sie mit dem Stand auf dem Gerät zusammen und speichert das Ergebnis zurück. Das passiert beim Öffnen, nach jeder Änderung und alle zwei Minuten.
- Ändert ihr dieselbe Aufgabe auf zwei Geräten, gewinnt die neuere Änderung. Abhaken und Bearbeiten werden getrennt behandelt: Hast du am Handy umbenannt und am PC abgehakt, bleibt beides erhalten.
- **Der Punkt am Wolken-Symbol** zeigt den Stand:
  - grün: abgeglichen
  - orange: offline oder noch nicht übertragen
  - rot: Anmeldung nötig oder Fehler (tippen für Details)
- Microsoft erneuert die Anmeldung normalerweise im Hintergrund. Falls nicht, steht oben „Anmeldung nötig“. Dann einmal auf **Neu anmelden** tippen. Deine Änderungen gehen dabei nicht verloren.

## Gut zu wissen

- Löschst du in Chrome die Website-Daten der App, ist der Stand **auf diesem Gerät** weg. Die OneDrive-Datei bleibt, und nach der Anmeldung ist alles wieder da.
- Die Datei `aufgaben.json` in OneDrive nicht von Hand bearbeiten. Ist sie beschädigt, überschreibt die App sie nicht, sondern meldet einen Fehler.
- **Neue Version einspielen**: geänderte Dateien bei GitHub hochladen und in `sw.js` die Zahl in `wochenplan-v1` erhöhen. Die Geräte laden die neue Version beim übernächsten Öffnen.

## Probleme

| Meldung | Lösung |
|---|---|
| Microsoft meldet beim Anmelden einen Fehler zur Umleitungs-URI (*AADSTS50011*) | Die Umleitungs-URI in der Registrierung muss exakt deiner Adresse entsprechen, inklusive `https://` und `/` am Ende, Plattform **SPA**. |
| Microsoft: *„unauthorized_client … not enabled for consumers“* | Bei „Unterstützte Kontotypen“ wurden keine persönlichen Konten gewählt. Neue Registrierung mit **Nur persönliche Microsoft-Konten** anlegen. |
| App zeigt weiter „Nur auf diesem Gerät“ | `config.js` noch nicht übernommen. Eine Minute warten und die App zweimal neu laden. |
| „Abgleich fehlgeschlagen“ | Auf das Wolken-Symbol tippen. Der Fehlertext steht in den Einstellungen. |

---

Verwendete Bausteine: Microsoft Authentication Library (MSAL.js 4.30, MIT-Lizenz) und die Schrift Barlow (SIL Open Font License). Beide liegen lokal im Paket, damit die App offline läuft.
