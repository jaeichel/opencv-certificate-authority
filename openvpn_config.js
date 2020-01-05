const fs = require('fs')

const { getCAFiles, getClientFiles, getServerFiles } = require('./ca')

const createCertString = (type, file) => {
  const cert = fs.readFileSync(file)
  return `<${type}>\n${cert}</${type}>\n`
}

const createClientConfig = clientName => {
  let config = fs.readFileSync('./openvpn_config_client_template.ovpn')

  const caFiles = getCAFiles()
  config += createCertString('ca', caFiles.cer)

  const clientFiles = getClientFiles(clientName)
  config += createCertString('cert', clientFiles.cer)
  config += createCertString('key', clientFiles.key)

  config += 'key-direction 1\n'
  config += createCertString('tls-auth', caFiles.ta)
  return config
}

const createServerConfig = () => {
  let config = fs.readFileSync('./openvpn_config_server_template.ovpn')

  const caFiles = getCAFiles()
  config += createCertString('ca', caFiles.cer)

  const serverFiles = getServerFiles()
  config += createCertString('cert', serverFiles.cer)
  config += createCertString('key', serverFiles.key)
  config += createCertString('dh', serverFiles.dh)

  config += 'key-direction 0\n'
  config += createCertString('tls-auth', caFiles.ta)
  return config
}

module.exports = {
  createClientConfig,
  createServerConfig
}
