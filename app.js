const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')

const { initializeCA } = require('./ca')
const { createCARouter } = require('./ca_router')
const params = require('./params.json')

const serverPort = process.env.SERVER_PORT || 3000

const app = express()
app.use(bodyParser.json())
app.use(express.json())

const startServer = async () => {
  await initializeCA(params)
  app.use('/', createCARouter())
  app.use('/', express.static(path.join(__dirname, 'html')))

  app.listen(serverPort, () => {
    console.log(`Listening on port ${serverPort}`)
  })
}

startServer()
