// CAPA 3 · DATOS — esquema de la base (las 8 tablas y el catálogo de estados).
//
// Es SQL guardado como texto dentro de TypeScript: así se compila junto con
// el resto del servidor y no hay que copiar ningún archivo aparte a dist/.
// conexion.ts lo ejecuta UNA sola vez, cuando la base es nueva.

export const ESQUEMA = `
-- =====================================================================
-- WhatsApp Team Sync - Esquema de base de datos (SQLite / sql.js)
-- Todas las llaves son numéricas (INTEGER). Fechas: Unix epoch en segundos (UTC)
-- =====================================================================
PRAGMA foreign_keys = ON;

-- Acceso al portal (permisos de consulta y de gestión)
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('consulta','gestion')),
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    INTEGER NOT NULL,
    last_login    INTEGER
);

-- Catálogo de estados de presencia (RN-01 a RN-04)
CREATE TABLE status (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL UNIQUE,   -- valor que viaja por el protocolo: attending | available | paused | offline
    label       TEXT NOT NULL,          -- etiqueta visible
    description TEXT
);

CREATE TABLE agents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_id   TEXT NOT NULL UNIQUE,    -- identificador de texto que usan la extensión y el servidor
    name       TEXT NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL
);

-- Clientes / chats atendidos
CREATE TABLE contacts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    wa_id      TEXT NOT NULL UNIQUE,    -- nombre del chat normalizado
    name       TEXT NOT NULL,
    phone      TEXT,                    -- número de teléfono (opcional, para uso futuro)
    first_seen INTEGER NOT NULL,
    last_seen  INTEGER NOT NULL,
    active     INTEGER NOT NULL DEFAULT 1
);

-- Estado ACTUAL de cada agente (una fila por agente; se sobrescribe)
CREATE TABLE agent_status (
    agent_ref   INTEGER PRIMARY KEY REFERENCES agents(id),
    status_ref  INTEGER NOT NULL REFERENCES status(id),
    contact_ref INTEGER REFERENCES contacts(id),
    updated_at  INTEGER                 -- cuándo cambió por última vez el estado o el contacto
);

CREATE TABLE sessions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    agent_ref        INTEGER NOT NULL REFERENCES agents(id),
    agent_name       TEXT NOT NULL,
    contact_ref      INTEGER NOT NULL REFERENCES contacts(id),
    started_at       INTEGER NOT NULL,
    ended_at         INTEGER,
    duration_seconds INTEGER,
    status           TEXT NOT NULL CHECK (status IN ('open','closed'))
);

-- Bitácora (RN-05). status_ref se llena SOLO cuando el evento cambia el estado;
-- en help_request y duplicate_alert queda NULL (RN-03, RN-07).
CREATE TABLE events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_ref INTEGER REFERENCES sessions(id),
    agent_ref   INTEGER REFERENCES agents(id),
    agent_name  TEXT NOT NULL,
    type        TEXT NOT NULL,
    status_ref  INTEGER REFERENCES status(id),
    contact_ref INTEGER REFERENCES contacts(id),
    detail      TEXT,
    created_at  INTEGER NOT NULL
);

-- Quiénes participan en un evento con más de un agente (alerta de duplicidad, RN-07)
CREATE TABLE event_participants (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_ref   INTEGER NOT NULL REFERENCES events(id),
    agent_ref   INTEGER NOT NULL REFERENCES agents(id),
    session_ref INTEGER REFERENCES sessions(id),
    UNIQUE (event_ref, agent_ref)
);

   -- Datos fijos del catálogo (ids 1 a 4)
   INSERT INTO status (id, code, label, description) VALUES
    (1, 'attending', 'Atendiendo',   'RN-01: conversación activa identificada y comunicación válida'),
    (2, 'available', 'Disponible',   'RN-02: sin conversación activa identificada'),
    (3, 'paused',    'Pausado',      'RN-03: pausa manual del agente'),
    (4, 'offline',   'Desconectado', 'RN-04: pérdida de comunicación detectada por heartbeat');
CREATE INDEX idx_sessions_agent       ON sessions(agent_ref);
CREATE INDEX idx_sessions_contact     ON sessions(contact_ref);
CREATE INDEX idx_sessions_started     ON sessions(started_at);
CREATE INDEX idx_events_session       ON events(session_ref);
CREATE INDEX idx_events_agent         ON events(agent_ref, created_at);
CREATE INDEX idx_events_created       ON events(created_at);
CREATE INDEX idx_participants_event   ON event_participants(event_ref);
CREATE INDEX idx_participants_agent   ON event_participants(agent_ref);


`
