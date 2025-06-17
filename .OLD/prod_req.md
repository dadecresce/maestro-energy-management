# MVP REQUIREMENTS - Web App IoT Tuya Smart Plug

## SCOPE MVP
**Obiettivo**: Sostituire l'app Tuya per controllo quotidiano basic con esperienza superiore in 4 mesi.

## 1. REQUISITI FUNZIONALI MVP

### 1.1 Core Features (Must Have)
- **MVF001**: Login con account Tuya esistente (OAuth2)
- **MVF002**: Import automatico dispositivi smart plug già configurati
- **MVF003**: Dashboard con lista dispositivi e stato corrente (on/off)
- **MVF004**: Controllo remoto on/off con feedback immediato
- **MVF005**: Rinomina dispositivi per identificazione facile
- **MVF006**: Visualizzazione stato connessione dispositivi (online/offline)

### 1.2 Features Nice-to-Have
- **MVF007**: Timer semplice (spegni dopo X minuti)
- **MVF008**: Consumo energetico base (se supportato dal dispositivo)
- **MVF009**: Aggiunta nuovi dispositivi via QR code

## 2. REQUISITI TECNICI MVP

### 2.1 Stack Minimo
- **MVT001**: Frontend: React + Vite (PWA ready)
- **MVT002**: Backend: Node.js + Express + MongoDB Atlas
- **MVT003**: Hosting: Vercel (frontend) + Railway/Render (backend)
- **MVT004**: Integrazione: Tuya IoT Core API
- **MVT005**: Auth: Auth0 o Firebase Auth

### 2.2 Integrazioni Essenziali
- **MVT006**: Tuya OpenAPI per controllo dispositivi
- **MVT007**: WebSocket per real-time updates (Socket.io)
- **MVT008**: Cache in-memory per ridurre API calls Tuya

## 3. REQUISITI UX/UI MVP

### 3.1 UI Essenziale
- **MVU001**: Layout responsive mobile-first
- **MVU002**: 3 schermate principali: Login, Dashboard, Dettaglio Dispositivo
- **MVU003**: Design system semplice (Material-UI o Chakra-UI)
- **MVU004**: Dark mode opzionale

### 3.2 UX Core
- **MVU005**: Onboarding 2 step: Login + Import dispositivi
- **MVU006**: Controllo dispositivo con singolo tap
- **MVU007**: Feedback visivo immediato azioni (loading, success, error)
- **MVU008**: Offline mode: mostra ultimo stato noto

## 4. VINCOLI MVP

### 4.1 Vincoli Ristretti
- **MV001**: Solo smart plug Tuya (no altri dispositivi)
- **MV002**: Solo utenti con account Tuya esistente
- **MV003**: Budget: €15k per MVP
- **MV004**: Timeline: 12 settimane
- **MV005**: Team: 2 developer + 1 designer part-time

### 4.2 Limitazioni Accettabili
- **MV006**: Max 20 dispositivi per utente
- **MV007**: No automazioni complesse
- **MV008**: No notifiche push
- **MV009**: Supporto solo Chrome/Safari mobile

## 5. OBIETTIVI BUSINESS MVP

### 5.1 Metriche di Validazione
- **MVO001**: 100 beta tester primi 30 giorni
- **MVO002**: 80% utenti completa setup con successo
- **MVO003**: 60% utenti usa app almeno 3x/settimana
- **MVO004**: Tempo medio controllo dispositivo < 3 secondi
- **MVO005**: Zero critical bugs in produzione

### 5.2 Criteri di Successo MVP
- **MVO006**: App più veloce dell'app Tuya nativa (percezione utenti)
- **MVO007**: Setup completabile in < 2 minuti
- **MVO008**: User feedback score > 4/5 per usabilità

## 6. FEATURE ROADMAP POST-MVP

### Phase 2 (dopo MVP)
- Aggiunta nuovi dispositivi
- Automazioni semplici
- Schedulazioni
- Notifiche

### Phase 3
- Altri tipi dispositivi Tuya
- Integrazioni voice assistant
- Condivisione dispositivi

## 7. TECHNICAL DEBT ACCETTABILE

### 7.1 Shortcuts MVP
- **TD001**: Polling invece di WebSocket per alcuni updates
- **TD002**: Validazione client-side basic
- **TD003**: Error handling semplificato
- **TD004**: No caching complesso
- **TD005**: Deployment manuale iniziale

### 7.2 Refactoring Post-MVP
- Architettura scalabile
- Test coverage > 80%
- CI/CD automatizzato
- Monitoring e analytics

## 8. DEFINITION OF DONE MVP

### 8.1 Completamento Features
- [ ] User può loggarsi con account Tuya
- [ ] Import e visualizzazione dispositivi funzionante
- [ ] Controllo on/off affidabile (95% success rate)
- [ ] App responsive su mobile Chrome/Safari
- [ ] Deploy su dominio custom funzionante

### 8.2 Quality Gates
- [ ] Manual testing su 5+ dispositivi diversi
- [ ] Performance: controllo dispositivo < 3s
- [ ] Security: no credentials hardcoded
- [ ] UX: 3+ utenti esterni completano task core
- [ ] Legal: privacy policy e terms of service

**Timeline MVP: 12 settimane**
- Week 1-2: Setup progetto + integrazione Tuya API
- Week 3-6: Core functionality (login, dashboard, controlli)
- Week 7-9: UI/UX refinement + responsive design
- Week 10-11: Testing, bug fixing, ottimizzazioni
- Week 12: Deploy e go-live beta

Questo MVP è focalizzato sul core value: controllo semplice e veloce dei smart plug, validando l'idea prima di investire in features complesse.