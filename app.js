const express = require('express')
const bodyParser = require('body-parser')
const path = require('path')

const { runCli } = require('./cli')
const { initializeCA } = require('./ca')
const { createCARouter } = require('./ca_router')
const params = require('./params.json')

const app = express()
app.use(bodyParser.json())
app.use(express.json())

const startServer = async () => {
  await initializeCA(params)
  app.use('/', createCARouter())
  app.use('/', express.static(path.join(__dirname, 'html')))

  runCli(app)
}

startServer()
