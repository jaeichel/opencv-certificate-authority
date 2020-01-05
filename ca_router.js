const crypto = require('crypto')
const express = require('express')
const fs = require('fs')
const jwt = require('jsonwebtoken')
const Sequelize = require('sequelize')

const { createClientKey, getClientFiles, createServerKey, getServerFiles } = require('./ca')
const { createClientConfig, createServerConfig } = require('./openvpn_config')

const requestDatabase = new Sequelize({
  dialect: 'sqlite',
  storage: './rest.sqlite',
  operatorsAliases: false
})

const CreateClientKeyRequest = requestDatabase.define('createClientKeyRequest', {
  clientName: Sequelize.STRING,
  status: Sequelize.ENUM('REQUEST_CREATED', 'ERROR', 'READY')
})

const createConfigRequest = (jwtSecretStr, clientName, clientEmail) => {
  let token
  return requestDatabase.sync().then(() => CreateClientKeyRequest.create({
    clientName,
    status: 'REQUEST_CREATED'
  })).then(request => {
    token = jwt.sign({
      requestId: request.id,
      clientName
    }, jwtSecretStr, { expiresIn: '1h' })
    return request
  }).then(request => {
    const params = JSON.parse(fs.readFileSync('./params.json'))
    createClientKey(clientName, clientEmail, params).then((clientFiles) => {
      request.update({ status: 'READY' })
    }).catch(err => {
      console.error(err)
      request.update({ status: 'ERROR' })
    })
    return token
  })
}

const CreateServerKeyRequest = requestDatabase.define('createServerKeyRequest', {
  status: Sequelize.ENUM('REQUEST_CREATED', 'ERROR', 'READY')
})

const createServerConfigRequest = (jwtSecretStr) => {
  let token
  return requestDatabase.sync().then(() => CreateServerKeyRequest.create({
    status: 'REQUEST_CREATED'
  })).then(request => {
    token = jwt.sign({
      requestId: request.id
    }, jwtSecretStr, { expiresIn: '1h' })
    return request
  }).then(request => {
    const params = JSON.parse(fs.readFileSync('./params.json'))
    createServerKey(params).then((serverFiles) => {
      request.update({ status: 'READY' })
    }).catch(err => {
      console.error(err)
      request.update({ status: 'ERROR' })
    })
    return token
  })
}

const removePrivateClientFiles = clientName => {
  const clientFiles = getClientFiles(clientName)
  for (const key in clientFiles) {
    if (key !== 'cer') {
      fs.unlinkSync(clientFiles[key])
    }
  }
}

const removePrivateServerFiles = () => {
  const serverFiles = getServerFiles()
  for (const key in serverFiles) {
    if (key !== 'cer') {
      fs.unlinkSync(serverFiles[key])
    }
  }
}

const createRouter = () => {
  const params = JSON.parse(fs.readFileSync('./params.json'))
  let { jwtSecretStr } = params
  if (!jwtSecretStr) {
    const jwtSecret = new Uint8Array(30)
    crypto.randomFillSync(jwtSecret)
    jwtSecretStr = jwtSecret.toString()
    params.jwtSecretStr = jwtSecretStr
    fs.writeFileSync('params.json', JSON.stringify(params))
  }

  const router = new express.Router()

  router.post('/client/configs', (req, res) => {
    const { clientName } = req.body
    const { clientEmail } = req.body
    const { token } = req.body

    if (!token) {
      requestDatabase.sync().then(() => CreateClientKeyRequest.findOne({
        where: { clientName }
      }).then(request => {
        if (request) {
          res.status(500).send('request already exists')
          return
        }
        createConfigRequest(jwtSecretStr, clientName, clientEmail).then(token => {
          res.send({
            token
          })
        }).catch(err => {
          console.error(err)
          res.status(500).send(err)
        })
      }))
    } else {
      const decodedToken = jwt.verify(token, jwtSecretStr)
      if (decodedToken) {
        requestDatabase.sync().then(() => CreateClientKeyRequest.findOne({
          where: { id: decodedToken.requestId }
        }).then(request => {
          if (!request) {
            res.status(500).send('invalid token requestId')
            return
          }

          if (request.status === 'READY') {
            res.send(createClientConfig(request.clientName))
            removePrivateClientFiles(request.clientName)
            request.destroy()
          } else {
            res.send(request.status)
          }
        }))
      } else {
        res.status(400).send('invalid token')
      }
    }
  })

  router.delete('/client/configs', (req, res) => {
    const { clientName } = req.body
    requestDatabase.sync().then(() => CreateClientKeyRequest.findOne({
      where: { clientName }
    }).then(request => {
      request.destroy()
    }))
  })

  router.post('/server/config', (req, res) => {
    const { token } = req.body

    if (!token) {
      requestDatabase.sync().then(() => CreateServerKeyRequest.findOne().then(request => {
        if (request) {
          res.status(500).send('request already exists')
          return
        }
        createServerConfigRequest(jwtSecretStr).then(token => {
          res.send({
            token
          })
        }).catch(err => {
          console.error(err)
          res.status(500).send(err)
        })
      }))
    } else {
      const decodedToken = jwt.verify(token, jwtSecretStr)
      if (decodedToken) {
        requestDatabase.sync().then(() => CreateServerKeyRequest.findOne({
          where: { id: decodedToken.requestId }
        }).then(request => {
          if (!request) {
            res.status(500).send('invalid token requestId')
            return
          }

          if (request.status === 'READY') {
            res.send(createServerConfig())
            removePrivateServerFiles()
            request.destroy()
          } else {
            res.send(request.status)
          }
        }))
      } else {
        res.status(400).send('invalid token')
      }
    }
  })

  router.delete('/server/config', (req, res) => {
    requestDatabase.sync().then(() => CreateServerKeyRequest.findOne().then(request => {
      if (request) {
        request.destroy()
        res.send('done')
        return
      }
      res.status(500).send('not found')
    }))
  })

  return router
}

module.exports = {
  createCARouter: createRouter
}
