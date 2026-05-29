const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const schema = `
  -- Users table (for saved demo accounts)
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT NOW(),
    last_login TIMESTAMP
  );

  -- Website customizations
  CREATE TABLE IF NOT EXISTS website_demos (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    template_id VARCHAR(50) NOT NULL,
    brand_name VARCHAR(255) NOT NULL,
    tagline VARCHAR(500),
    primary_color VARCHAR(7) DEFAULT '#6366f1',
    secondary_color VARCHAR(7) DEFAULT '#8b5cf6',
    services JSONB DEFAULT '[]',
    phone VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    logo_text VARCHAR(100),
    hero_image_url TEXT,
    about_text TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- Voice agent configurations
  CREATE TABLE IF NOT EXISTS voice_agent_configs (
    id SERIAL PRIMARY KEY,
    uuid VARCHAR(36) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    agent_name VARCHAR(255) NOT NULL,
    business_name VARCHAR(255) NOT NULL,
    industry VARCHAR(100) NOT NULL,
    voice_persona VARCHAR(100) DEFAULT 'professional-female',
    greeting_script TEXT,
    faqs JSONB DEFAULT '[]',
    services JSONB DEFAULT '[]',
    business_hours JSONB,
    phone VARCHAR(50),
    transfer_phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  -- Leads / contact form submissions
  CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    business_name VARCHAR(255),
    interest VARCHAR(100),
    message TEXT,
    source VARCHAR(100),
    status VARCHAR(50) DEFAULT 'new',
    website_demo_uuid VARCHAR(36),
    voice_config_uuid VARCHAR(36),
    created_at TIMESTAMP DEFAULT NOW()
  );

  -- Demo call requests (Twilio / voice AI)
  CREATE TABLE IF NOT EXISTS demo_calls (
    id SERIAL PRIMARY KEY,
    phone_number VARCHAR(50) NOT NULL,
    voice_config_uuid VARCHAR(36),
    lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'pending',
    provider VARCHAR(50),
    provider_call_id VARCHAR(255),
    duration_seconds INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
  );

  -- Sessions (if using connect-pg-simple)
  CREATE TABLE IF NOT EXISTS session (
    sid VARCHAR NOT NULL COLLATE "default",
    sess JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL,
    CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE
  );

  CREATE INDEX IF NOT EXISTS IDX_session_expire ON session (expire);

  -- Admin activity log
  CREATE TABLE IF NOT EXISTS admin_log (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES users(id),
    action VARCHAR(255),
    details JSONB,
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

async function initDB() {
  try {
    await pool.query(schema);
    console.log('✅ Database schema initialized');

    // Create default admin user if not exists
    const bcrypt = require('bcryptjs');
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@bloomup.ca';
    const adminPass = process.env.ADMIN_PASSWORD || 'changeme123';
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [adminEmail]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 12);
      await pool.query(
        'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
        [adminEmail, hash, 'Admin', 'admin']
      );
      console.log('✅ Default admin user created:', adminEmail);
    }
  } catch (err) {
    console.error('❌ Database init error:', err.message);
  }
}

module.exports = { pool, initDB };
