const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// HOME
router.get('/', async (req, res) => {
  res.render('pages/home', {
    title: 'Digital Growth for Local Businesses',
    contactSuccess: req.session.contactSuccess,
  });
  delete req.session.contactSuccess;
});

// BUILDER
router.get('/builder', (req, res) => {
  res.render('pages/builder', { title: 'Website Builder' });
});

router.post('/builder/save', requireAuth, async (req, res) => {
  try {
    const { template_id, brand_name, tagline, primary_color, secondary_color, services, phone, email, address, about_text } = req.body;
    if (!brand_name) return res.json({ success: false, error: 'Business name required' });
    const uuid = uuidv4();
    await pool.query(
      `INSERT INTO website_demos (uuid, user_id, template_id, brand_name, tagline, primary_color, secondary_color, services, phone, email, address, about_text)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [uuid, req.session.userId, template_id, brand_name, tagline, primary_color, secondary_color,
       JSON.stringify(services || []), phone, email, address, about_text]
    );
    res.json({ success: true, uuid, url: `${process.env.APP_URL}/demo/${uuid}` });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Database error' });
  }
});

router.get('/demo/:uuid', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM website_demos WHERE uuid = $1', [req.params.uuid]);
    if (!rows.length) return res.status(404).render('pages/error', { title: 'Not Found', message: 'Demo not found', code: 404 });
    res.render('pages/demo-preview', { demo: rows[0], title: rows[0].brand_name });
  } catch (err) {
    res.status(500).render('pages/error', { title: 'Error', message: 'Server error', code: 500 });
  }
});

// VOICE AGENT
router.get('/voice-agent', (req, res) => {
  res.render('pages/voice-agent', { title: 'AI Voice Agent' });
});

router.post('/voice-agent/save', requireAuth, async (req, res) => {
  try {
    const { agent_name, business_name, industry, voice_persona, services, faqs, business_hours, phone, transfer_phone } = req.body;
    const uuid = uuidv4();
    await pool.query(
      `INSERT INTO voice_agent_configs (uuid, user_id, agent_name, business_name, industry, voice_persona, services, faqs, business_hours, phone, transfer_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [uuid, req.session.userId, agent_name, business_name, industry, voice_persona,
       JSON.stringify(services || []), JSON.stringify(faqs || []), JSON.stringify(business_hours || {}), phone, transfer_phone]
    );
    res.json({ success: true, uuid });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: 'Database error' });
  }
});

// ============================================================
// FIX #1: VOICE CALL — Twilio + Retell AI (was fully commented out)
// ============================================================
router.post('/voice-agent/request-call', async (req, res) => {
  try {
    const { phone, agent_name, business_name, industry, services, faqs } = req.body;
    if (!phone) return res.json({ success: false, error: 'Phone number required' });

    // Log what env vars are present (visible in Railway logs)
    const twilioSid   = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth  = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom  = process.env.TWILIO_PHONE_NUMBER;
    const retellKey   = process.env.RETELL_API_KEY;
    const retellAgent = process.env.RETELL_AGENT_ID;

    console.log('[call-request] env check:', {
      TWILIO_ACCOUNT_SID:  twilioSid  ? '✓ set' : '✗ missing',
      TWILIO_AUTH_TOKEN:   twilioAuth ? '✓ set' : '✗ missing',
      TWILIO_PHONE_NUMBER: twilioFrom ? '✓ set' : '✗ missing',
      RETELL_API_KEY:      retellKey  ? '✓ set' : '✗ missing',
      RETELL_AGENT_ID:     retellAgent? '✓ set' : '✗ missing',
    });

    // Save lead + call record regardless of provider
    let leadId = null;
    if (process.env.DATABASE_URL) {
      try {
        const { rows: leadRows } = await pool.query(
          `INSERT INTO leads (full_name, email, phone, business_name, interest, source, message)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          ['Demo Call Request', 'demo@bloomup.ca', phone, business_name || 'Demo', 'voice_demo',
           'voice_agent_page', `Demo call for agent: ${agent_name}`]
        );
        leadId = leadRows[0]?.id;
        await pool.query(
          `INSERT INTO demo_calls (phone_number, lead_id, status, provider) VALUES ($1,$2,$3,$4)`,
          [phone, leadId, 'pending', retellKey ? 'retell' : 'twilio']
        );
      } catch (dbErr) {
        console.error('[call-request] DB error:', dbErr.message);
      }
    }

    // --- PATH A: Retell AI + Twilio phone number (recommended) ---
    if (retellKey && retellAgent && twilioFrom) {
      console.log('[call-request] Using Retell AI path');
      const retellRes = await fetch('https://api.retellai.com/v2/create-phone-call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${retellKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from_number: twilioFrom,
          to_number: phone,
          override_agent_id: retellAgent,
          retell_llm_dynamic_variables: {
            agent_name: agent_name || 'Aria',
            business_name: business_name || 'the business',
            services: (services || []).join(', '),
            industry: industry || 'service'
          }
        })
      });
      const retellData = await retellRes.json();
      console.log('[call-request] Retell response:', JSON.stringify(retellData));

      if (retellData.call_id) {
        if (leadId) {
          await pool.query(
            'UPDATE demo_calls SET provider_call_id=$1, status=$2 WHERE lead_id=$3',
            [retellData.call_id, 'initiated', leadId]
          ).catch(e => console.error('[call-request] DB update error:', e.message));
        }
        return res.json({ success: true });
      }
      const errMsg = retellData.message || retellData.error || JSON.stringify(retellData);
      console.error('[call-request] Retell error:', errMsg);
      return res.json({ success: false, error: `Retell error: ${errMsg}` });
    }

    // --- PATH B: Twilio only (TwiML) ---
    if (twilioSid && twilioAuth && twilioFrom) {
      console.log('[call-request] Using Twilio-only path');
      const auth = Buffer.from(`${twilioSid}:${twilioAuth}`).toString('base64');
      const twiml = `<Response><Say voice="Polly.Joanna">Hello! This is a demo call from BloomUp. Your AI receptionist, ${agent_name || 'Aria'}, for ${business_name || 'your business'}, is ready to go live. Thank you for testing BloomUp!</Say></Response>`;

      const twilioRes = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({ From: twilioFrom, To: phone, Twiml: twiml })
        }
      );
      const twilioData = await twilioRes.json();
      console.log('[call-request] Twilio response:', JSON.stringify(twilioData));

      if (twilioData.sid) {
        if (leadId) {
          await pool.query(
            'UPDATE demo_calls SET provider_call_id=$1, status=$2 WHERE lead_id=$3',
            [twilioData.sid, 'initiated', leadId]
          ).catch(e => console.error('[call-request] DB update error:', e.message));
        }
        return res.json({ success: true });
      }
      const errMsg = twilioData.message || JSON.stringify(twilioData);
      console.error('[call-request] Twilio error:', errMsg);
      return res.json({ success: false, error: `Twilio error: ${errMsg}` });
    }

    // --- No provider configured ---
    const missing = [];
    if (!twilioSid)   missing.push('TWILIO_ACCOUNT_SID');
    if (!twilioAuth)  missing.push('TWILIO_AUTH_TOKEN');
    if (!twilioFrom)  missing.push('TWILIO_PHONE_NUMBER');
    if (!retellKey)   missing.push('RETELL_API_KEY (optional but recommended)');
    if (!retellAgent) missing.push('RETELL_AGENT_ID (optional but recommended)');
    console.error('[call-request] Missing env vars:', missing.join(', '));
    return res.json({
      success: false,
      error: `Missing Railway variables: ${missing.join(', ')}`
    });

  } catch (err) {
    console.error('[call-request] Unhandled error:', err);
    res.json({ success: false, error: 'Server error: ' + err.message });
  }
});

// AI CHAT API
router.post('/api/chat', async (req, res) => {
  try {
    const { system, messages } = req.body;
    if (!messages?.length) return res.json({ reply: 'How can I help you today?' });

    if (!process.env.ANTHROPIC_API_KEY) {
      const userMsg = messages[messages.length-1]?.content?.toLowerCase() || '';
      let reply = "Thanks for your message! How can I assist you today?";
      if (userMsg.includes('price') || userMsg.includes('cost') || userMsg.includes('how much'))
        reply = "Great question! We offer free estimates for all our services. Can I get your name and a good time to call you back?";
      else if (userMsg.includes('emergency') || userMsg.includes('urgent'))
        reply = "I understand this is urgent! Let me get someone to call you right away. Can you give me your phone number?";
      else if (userMsg.includes('book') || userMsg.includes('appointment') || userMsg.includes('schedule'))
        reply = "I'd be happy to schedule that! What day and time works best? We're available Monday-Friday 8am-6pm and Saturdays 9am-3pm.";
      else if (userMsg.includes('hour') || userMsg.includes('open') || userMsg.includes('close'))
        reply = "We're open Monday-Friday 8am-6pm and Saturdays 9am-3pm. For emergencies, we offer 24/7 service. Anything else?";
      else if (userMsg.match(/^(hello|hi|hey)/))
        reply = "Hi there! Thanks for calling. How can I help you today? I can answer questions, provide pricing, or schedule an appointment.";
      return res.json({ reply });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: system || 'You are a helpful AI receptionist. Keep responses brief and conversational.',
        messages: messages.slice(-10)
      })
    });
    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Sorry, I had trouble with that. How can I help you?';
    res.json({ reply });
  } catch (err) {
    console.error('Chat API error:', err);
    res.json({ reply: "I'm experiencing a brief issue. Please try again!" });
  }
});

// LEADS
router.post('/leads', async (req, res) => {
  try {
    const { full_name, email, phone, business_name, interest, message, source } = req.body;
    if (!full_name || !email) return res.redirect('/?error=required');
    await pool.query(
      `INSERT INTO leads (full_name, email, phone, business_name, interest, message, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [full_name, email, phone, business_name, interest, message, source || 'website']
    );
    req.session.contactSuccess = true;
    res.redirect('/#contact');
  } catch (err) {
    console.error(err);
    res.redirect('/?error=submit');
  }
});

// AUTH
router.get('/auth/login', (req, res) => {
  if (req.session.userId) return res.redirect(req.query.redirect || '/');
  res.render('pages/login', { title: 'Sign In', redirect: req.query.redirect || '' });
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password, redirect: redir } = req.body;
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.render('pages/login', { title: 'Sign In', error: 'Invalid email or password.', redirect: redir });
    }
    req.session.userId   = user.id;
    req.session.userEmail = user.email;
    req.session.userName  = user.full_name;
    req.session.userRole  = user.role;
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const returnTo = redir || req.session.returnTo || (user.role === 'admin' ? '/admin' : '/');
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('pages/login', { title: 'Sign In', error: 'An error occurred. Please try again.' });
  }
});

router.get('/auth/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('pages/register', { title: 'Create Account', redirect: req.query.redirect || '' });
});

router.post('/auth/register', async (req, res) => {
  try {
    const { email, password, full_name, redirect: redir } = req.body;
    if (!email || !password || password.length < 8) {
      return res.render('pages/register', { title: 'Create Account', error: 'Please fill all fields. Password must be at least 8 characters.' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.render('pages/register', { title: 'Create Account', error: 'An account with that email already exists.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, full_name) VALUES ($1,$2,$3) RETURNING *',
      [email.toLowerCase().trim(), hash, full_name]
    );
    const user = rows[0];
    req.session.userId    = user.id;
    req.session.userEmail = user.email;
    req.session.userName  = user.full_name;
    req.session.userRole  = user.role;
    res.redirect(redir || '/builder');
  } catch (err) {
    console.error(err);
    res.render('pages/register', { title: 'Create Account', error: 'Registration failed. Please try again.' });
  }
});

router.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ADMIN
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [leads, demos, voices, calls, recentLeads] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM leads'),
      pool.query('SELECT COUNT(*) FROM website_demos'),
      pool.query('SELECT COUNT(*) FROM voice_agent_configs'),
      pool.query('SELECT COUNT(*) FROM demo_calls'),
      pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 8')
    ]);
    res.render('pages/admin', {
      title: 'Admin Dashboard',
      stats: {
        totalLeads: parseInt(leads.rows[0].count),
        totalDemos: parseInt(demos.rows[0].count),
        totalVoiceConfigs: parseInt(voices.rows[0].count),
        totalCalls: parseInt(calls.rows[0].count)
      },
      recentLeads: recentLeads.rows
    });
  } catch (err) {
    console.error(err);
    res.render('pages/admin', { title: 'Admin Dashboard', stats: {}, recentLeads: [] });
  }
});

router.get('/admin/leads', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 100');
    res.render('pages/admin-leads', { title: 'Leads', leads: rows });
  } catch (err) {
    res.render('pages/admin-leads', { title: 'Leads', leads: [] });
  }
});

router.post('/admin/leads/:id/status', requireAdmin, async (req, res) => {
  await pool.query('UPDATE leads SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
  res.redirect('/admin/leads');
});

// 404
router.use((req, res) => {
  res.status(404).render('pages/error', { title: 'Not Found', message: "The page you're looking for doesn't exist.", code: 404 });
});

module.exports = router;
