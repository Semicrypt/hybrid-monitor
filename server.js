// server.js

const express = require('express')
const cors = require('cors')
const axios = require('axios')
const http = require('http')
const { Server } = require('socket.io')
const nodemailer = require('nodemailer')

const app = express()

const server = http.createServer(app)

const io = new Server(server)

const PORT = 5000

app.use(cors())
app.use(express.json())
app.use(express.static('public'))

console.log("🚀 FULL PROFESSIONAL MONITOR RUNNING")

// ================= STORAGE =================
let services = []

let history = []

let running = true

// ================= EMAIL =================
const transporter = nodemailer.createTransport({

  service: 'gmail',

  auth: {

    user: 'ifeanyidivine1999@gmail.com',

    pass: 'whyf ppnb tfex xebv'
  }
})

// ================= EMAIL FUNCTION =================
function sendEmail(service, status) {

  transporter.sendMail({

    from: 'ifeanyidivine1999@gmail.com',

    to: 'ifeanyidivine1999@gmail.com',

    subject: `🚨 ${service.name} is ${status}`,

    text: `

Service Alert

Service:
${service.name}

URL:
${service.url}

Status:
${status}

Time:
${new Date().toLocaleString()}

    `

  }, (err) => {

    if (err) {

      console.log(
        "Email error:",
        err.message
      )

    } else {

      console.log(
        `📧 Email sent for ${service.name}`
      )
    }
  })
}

// ================= HOME =================
app.get('/', (req, res) => {

  res.sendFile(
    __dirname + '/public/index.html'
  )
})

// ================= ADD SERVICE =================
app.post('/services', (req, res) => {

  const name =
    req.body.name?.trim()

  const url =
    req.body.url?.trim()

  if (!name || !url) {

    return res.status(400).json({
      error: 'Name and URL required'
    })
  }

  const service = {

    id: Date.now(),

    name,

    url,

    status: 'UNKNOWN',

    responseTime: 0,

    checks: 0,

    fails: 0,

    uptime: 100,

    wasDown: false
  }

  services.push(service)

  res.json(service)
})

// ================= GET SERVICES =================
app.get('/services', (req, res) => {

  res.json(services)
})

// ================= DELETE SERVICE =================
app.delete('/services/:id', (req, res) => {

  const id =
    Number(req.params.id)

  services =
    services.filter(
      s => s.id !== id
    )

  res.json({
    message: 'Service deleted'
  })
})

// ================= GET HISTORY =================
app.get('/history', (req, res) => {

  res.json(history)
})

// ================= START =================
app.get('/start', (req, res) => {

  running = true

  res.json({
    message: 'Monitoring started'
  })
})

// ================= STOP =================
app.get('/stop', (req, res) => {

  running = false

  res.json({
    message: 'Monitoring stopped'
  })
})

// ================= CHECK FUNCTION =================
async function check(service) {

  const start =
    Date.now()

  let status = 'DOWN'

  try {

    await axios.get(service.url, {

      timeout: 5000
    })

    status = 'UP'

  } catch {

    status = 'DOWN'
  }

  const responseTime =
    Date.now() - start

  // ================= STATS =================
  service.checks++

  if (status === 'DOWN') {

    service.fails++
  }

  service.uptime = (

    (
      service.checks -
      service.fails
    )

    / service.checks

  ) * 100

  service.status = status

  service.responseTime = responseTime

  // ================= HISTORY =================
  history.unshift({

    service: service.name,

    status,

    responseTime,

    time:
      new Date()
      .toLocaleTimeString()
  })

  // KEEP ONLY LAST 50 EVENTS
  history = history.slice(0, 50)

  // ================= EMAIL ALERTS =================
  if (
    status === 'DOWN' &&
    !service.wasDown
  ) {

    service.wasDown = true

    sendEmail(service, 'DOWN')
  }

  if (
    status === 'UP' &&
    service.wasDown
  ) {

    service.wasDown = false

    sendEmail(service, 'UP')
  }

  // ================= REALTIME UPDATE =================
  io.emit('update', {

    service: {

      id: service.id,

      name: service.name,

      url: service.url,

      uptime:
        service.uptime.toFixed(2),

      checks:
        service.checks,

      fails:
        service.fails
    },

    status,

    responseTime
  })
}

// ================= LOOP =================
setInterval(() => {

  if (!running) return

  services.forEach(service => {

    check(service).catch(() => {})
  })

}, 5000)

// ================= START SERVER =================
server.listen(PORT, () => {

  console.log(
    `✅ Server running at http://localhost:${PORT}`
  )

})
