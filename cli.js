const fs = require('fs')
const https = require('https')
const nodemailer = require('nodemailer')

const { createClientConfigRequest, removePrivateServerFiles } = require('./ca_router')
const { createServerKey, getAllClientCertInfo, getServerCertInfo } = require('./ca')
const { createServerConfig } = require('./openvpn_config')

const emailToken = async (clientName, clientEmail, token) => {
  const params = JSON.parse(fs.readFileSync('./params.json'))
  const transporter = nodemailer.createTransport(params.emailTransporter)
  const url = `${params.restServerUri}/redeem_client_config.html?clientName=${clientName}&token=${token}`
  const mailOptions = {
    from: params.emailTransporter.auth.user,
    to: clientEmail,
    subject: 'OpenVPN Config Renewal',
    html: `Your OpenVPN config will expire soon.<br> \
      Warning: you can only use the following url once.<br> \
      Please connect to the VPN and then visit <a href='${url}'>${params.restServerUri}</a> to renew your open vpn config for ${clientName}.<br> \
      This url is valid for 15 days.`
  }
  await transporter.verify()
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error(error)
      return
    }
    console.log('Email sent: ' + info.response)
  })
}

const runCli = app => {
  const argv = require('yargs')  // eslint-disable-line
    .command('clientConfigToken clientName clientEmail', 'create and email client config token')
    .example('$0 --clientConfigToken --clientName=user-desktop --clientEmail=user@protonmail.com')
    .command('updateServerConfig', 'update server config')
    .example('$0 --updateServerConfig')
    .command('autoRenew', 'renew all certificates close to expiry')
    .example('$0 --autoRenew')
    .argv

  if (argv.clientConfigToken) {
    console.log('Creating client config and request token...')
    console.log('Key generation may take several minutes.')
    createClientConfigRequest(argv.clientName, argv.clientEmail).then((token) => {
      emailToken(argv.clientName, argv.clientEmail, token)
      console.log(token)
    })
  } else if (argv.updateServerConfig) {
    console.log('Creating server config...')
    console.log('Key generation may take several minutes.')
    const params = JSON.parse(fs.readFileSync('./params.json'))
    createServerKey(params).then((serverFiles) => {
      fs.writeFileSync(params.openVPNServerConfigPath, createServerConfig())
      removePrivateServerFiles()
    }).catch(err => {
      console.error(err)
    })
  } else if (argv.autoRenew) {
    console.log('Auto renewing keys...')
    const params = JSON.parse(fs.readFileSync('./params.json'))
    const expiryDays = params.expiryDays || 30

    const clientInfoPromises = getAllClientCertInfo(params)
    const serverInfoPromises = getServerCertInfo(params)

    const currentDate = new Date()
    const after30days = currentDate.setDate(currentDate.getDate() + expiryDays)
    clientInfoPromises.then(clientInfos => clientInfos.forEach(info => {
      if (info.expireDateMs < after30days) {
        console.log('renewing client key')
        createClientConfigRequest(info.commonName, info.email).then((token) => {
          emailToken(info.commonName, info.email, token)
        })
      }
    })).then(() => serverInfoPromises).then(serverInfos => serverInfos.forEach(info => {
      if (info.expireDateMs < after30days) {
        console.log('renewing server key')
        createServerKey(params).then((serverFiles) => {
          fs.writeFileSync(params.openVPNServerConfigPath, createServerConfig())
          removePrivateServerFiles()
        }).catch(err => {
          console.error(err)
        })
      }
    }))
  } else {
    const params = JSON.parse(fs.readFileSync('./params.json'))
    if (params.sslKey && params.sslCer) {
      const options = {
        key: fs.readFileSync(params.sslKey, 'utf8'),
        cert: fs.readFileSync(params.sslCer, 'utf8')
      }

      const serverPort = process.env.SERVER_PORT || 443
      https.createServer(options, app).listen(serverPort, () => {
        console.log(`Listening on port ${serverPort}`)
      })
    } else {
      const serverPort = process.env.SERVER_PORT || 3000
      app.listen(serverPort, () => {
        console.log(`Listening on port ${serverPort}`)
      })
    }
  }
}

module.exports = {
  runCli
}
