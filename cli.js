const { createClientConfigRequest, createServerConfigRequest } = require('./ca_router')

const runCli = app => {
  const argv = require('yargs')  // eslint-disable-line
    .command('clientConfigToken clientName clientEmail', 'create client config token')
    .example('$0 --clientConfigToken --clientName=user-desktop --clientEmail=user@protonmail.com')
    .command('serverConfig', 'update server config')
    .example('$0 --serverConfig')
    .argv

  if (argv.clientConfigToken) {
    console.log('Creating client config and request token...')
    console.log('Key generation may take several minutes.')
    createClientConfigRequest(argv.clientName, argv.clientEmail).then((token) => {
      console.log(token)
    })
  } else if (argv.serverConfig) {
    console.log('Creating server config...')
    console.log('Key generation may take several minutes.')
    createServerConfigRequest(argv.clientName, argv.clientEmail).then((token) => {
      console.log(token)
    })
  } else {
    const serverPort = process.env.SERVER_PORT || 3000
    app.listen(serverPort, () => {
      console.log(`Listening on port ${serverPort}`)
    })
  }
}

module.exports = {
  runCli
}
