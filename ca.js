const fs = require('fs')
const generator = require('generate-password')
const path = require('path')
const { spawn } = require('child_process')

const envVars = () => {
  return { OPENSSL_CONF: path.join(__dirname, 'openssl.cnf') }
}

const makeDirIfMissing = dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir)
  }
}

const generatePassword = () => {
  return generator.generate({
    length: 30,
    numbers: true,
    symbols: false,
    uppercase: true
  })
}

const createOpenSSLConf = () => {
  let config = fs.readFileSync('openssl_template.cnf', 'utf8')
  config = config.replace(/\.\/CA/g, `${__dirname}/CA`)
  config = config.replace(/\\/g, '\\\\')
  fs.writeFileSync('openssl.cnf', config)
}

const getCAFiles = () => ({
  cer: 'CA/common/ca.cer',
  key: 'CA/common/ca.key',
  crl: 'CA/common/crl.pem',
  ta: 'CA/common/ta.key'
})

const createCACert = (params) => {
  const caFiles = getCAFiles()
  if (!fs.existsSync(caFiles.ta)) {
    createCATA(params)
  }
  if (fs.existsSync(caFiles.key)) {
    return Promise.resolve(caFiles)
  }
  fs.writeFileSync('CA/index.txt', 1)

  return new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'req',
      '-new',
      '-x509',
      '-days', params.certificateLifetimeDays,
      '-extensions', 'v3_ca',
      '-newkey', `rsa:${params.keyBitSize}`,
      '-keyout', caFiles.key,
      '-out', caFiles.cer,
      '-batch',
      '-passout', `pass:${params.caPassword}`
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  }).then(() => caFiles)
}

const createCATA = (params) => {
  const caFiles = getCAFiles()
  return new Promise((resolve, reject) => {
    const resp = spawn(params.openVPNPath, [
      '--genkey',
      '--secret', caFiles.ta
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  }).then(() => caFiles)
}

const createCACRL = (params) => {
  const caFiles = getCAFiles()
  return new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'ca',
      '-gencrl',
      '-out', caFiles.crl,
      '-passin', `pass:${params.caPassword}`
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  }).then(() => caFiles)
}

const getServerFiles = () => ({
  cer: 'CA/server/server.cer',
  key: 'CA/server/server.key',
  req: 'CA/server/server.req',
  p12: 'CA/server/server.p12',
  dh: 'CA/server/server.dh'
})

const createServerKey = (params) => {
  const caFiles = getCAFiles()
  const serverFiles = getServerFiles()
  if (fs.existsSync(serverFiles.dh)) {
    return Promise.resolve(serverFiles)
  }

  return new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'genrsa',
      '-out', serverFiles.key, params.keyBitSize,
      '-aes256'
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  }).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'req',
      '-nodes',
      '-new',
      '-key', serverFiles.key,
      '-out', serverFiles.req,
      '-extensions', 'v3_server',
      '-batch',
      '-subj', `/C=CA/ST=Ontario/L=Toronto/O=none/OU=none/CN=${params.serverCN}/emailAddress=${params.serverEmail}`
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'x509',
      '-req',
      '-days', params.serverCertificateLifetimeDays,
      '-extfile', 'openssl.cnf',
      '-extensions', 'v3_server',
      '-in', serverFiles.req,
      '-CA', caFiles.cer,
      '-CAkey', caFiles.key,
      '-CAcreateserial',
      '-out', serverFiles.cer,
      '-passin', `pass:${params.caPassword}`
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'pkcs12',
      '-password', 'pass:',
      '-export',
      '-in', serverFiles.cer,
      '-inkey', serverFiles.key,
      '-certfile', caFiles.cer,
      '-out', serverFiles.p12
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'gendh',
      '-out', serverFiles.dh, 2048
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => serverFiles)
}

const getClientFiles = clientName => ({
  cer: `CA/clients/${clientName}.cer`,
  key: `CA/clients/${clientName}.key`,
  req: `CA/clients/${clientName}.req`,
  p12: `CA/clients/${clientName}.p12`,
  dh: `CA/clients/${clientName}.dh`
})

const createClientKey = (clientName, emailAddress, params) => {
  const caFiles = getCAFiles()
  const clientFiles = getClientFiles(clientName)
  if (fs.existsSync(clientFiles.dh)) {
    return Promise.resolve(clientFiles)
  }

  return new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'genrsa',
      '-out', clientFiles.key, params.keyBitSize,
      '-aes256'
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  }).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'req',
      '-nodes',
      '-new',
      '-key', clientFiles.key,
      '-out', clientFiles.req,
      '-extensions', 'v3_client',
      '-batch',
      '-subj', `/C=CA/ST=Ontario/L=Toronto/O=none/OU=none/CN=${clientName}/emailAddress=${emailAddress}`
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'x509',
      '-req',
      '-days', params.clientCertificateLifetimeDays,
      '-extfile', 'openssl.cnf',
      '-extensions', 'v3_client',
      '-in', clientFiles.req,
      '-CA', caFiles.cer,
      '-CAkey', caFiles.key,
      '-CAcreateserial',
      '-out', clientFiles.cer,
      '-passin', `pass:${params.caPassword}`
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'pkcs12',
      '-password', 'pass:',
      '-export',
      '-in', clientFiles.cer,
      '-inkey', clientFiles.key,
      '-certfile', caFiles.cer,
      '-out', clientFiles.p12
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'gendh',
      '-out', clientFiles.dh, 2048
    ], { env: envVars(), cwd: __dirname })
    resp.stdout.pipe(process.stdout)
    resp.stderr.pipe(process.stderr)
    resp.on('exit', () => {
      resolve(resp)
    })
  })).then(() => clientFiles)
}

const getCertInfo = (params, cerFilepath) => {
  const certInfo = {}
  return new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'x509',
      '-in', cerFilepath,
      '-noout',
      '-dates'
    ], { env: envVars(), cwd: __dirname })
    resp.stderr.pipe(process.stderr)
    resp.stdout.on('data', data => {
      certInfo.expireDateMs = Date.parse(data.toString().split('\n')[1].split('=')[1])
    })
    resp.on('exit', () => {
      resolve(certInfo)
    })
  }).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'x509',
      '-in', cerFilepath,
      '-noout',
      '-email'
    ], { env: envVars(), cwd: __dirname })
    resp.stderr.pipe(process.stderr)
    resp.stdout.on('data', data => {
      certInfo.email = data.toString().split('\n')[0]
    })
    resp.on('exit', () => {
      resolve(certInfo)
    })
  })).then(() => new Promise((resolve, reject) => {
    const resp = spawn(params.openSSLPath, [
      'x509',
      '-in', cerFilepath,
      '-noout',
      '-subject'
    ], { env: envVars(), cwd: __dirname })
    resp.stderr.pipe(process.stderr)
    resp.stdout.on('data', data => {
      certInfo.commonName = data.toString().split('/').filter(part => part.includes('CN=')).join('').split('=')[1]
    })
    resp.on('exit', () => {
      resolve(certInfo)
    })
  }))
}

const getAllClientCertInfo = (params) => {
  const files = fs.readdirSync('./CA/clients')
  const certInfos = files.filter(file => file.includes('.cer'))
    .map(async file => getCertInfo(params, path.join('./CA/clients/', file)))
  return Promise.all(certInfos)
}

const getAllServerCertInfo = (params) => {
  const files = fs.readdirSync('./CA/server')
  const certInfos = files.filter(file => file.includes('.cer'))
    .map(async file => getCertInfo(params, path.join('./CA/server/', file)))
  return Promise.all(certInfos)
}

const initializeCA = async (params) => {
  if (!params.caPassword) {
    params.caPassword = generatePassword()
    fs.writeFileSync('params.json', JSON.stringify(params))
  }

  makeDirIfMissing('CA')
  makeDirIfMissing('CA/common')
  makeDirIfMissing('CA/server')
  makeDirIfMissing('CA/clients')

  createOpenSSLConf()
  await createCACert(params)
  await createCACRL(params)

  console.log('done')
}

module.exports = {
  initializeCA,
  createCACert,
  createServerKey,
  createClientKey,
  createCACRL,
  getCAFiles,
  getServerFiles,
  getClientFiles,
  getCertInfo,
  getAllClientCertInfo,
  getAllServerCertInfo
}
