// node-forge is loaded via CDN in index.html as window.forge
declare const forge: typeof import("node-forge");

export type CertMode = "self-signed" | "ca-chain";

export interface CertOptions {
  mode: CertMode;
  commonName: string;
  organization?: string;
  country?: string;
  state?: string;
  locality?: string;
  caDays: number;
  certDays: number;
  keySize: number;
  sans: string[];
  ipAddresses: string[];
  existingCaCert?: string;
  existingCaKey?: string;
}

export interface GeneratedCert {
  mode: CertMode;
  caCertificate?: string;
  caPrivateKey?: string;
  serverCertificate: string;
  serverPrivateKey: string;
  csr: string;
  caInfo?: {
    commonName: string;
    organization: string;
    validFrom: string;
    validTo: string;
    keySize: number;
    serialNumber: string;
    fingerprint: string;
  };
  serverInfo: {
    commonName: string;
    validFrom: string;
    validTo: string;
    keySize: number;
    algorithm: string;
    sans: string[];
    ipAddresses: string[];
    serialNumber: string;
    fingerprint: string;
  };
}

function generateSerialNumber(): string {
  const bytes = forge.random.getBytesSync(16);
  const firstByte = bytes.charCodeAt(0) & 0x7f;
  const hexBytes = [firstByte.toString(16).padStart(2, "0")];
  for (let i = 1; i < bytes.length; i++) {
    hexBytes.push(bytes.charCodeAt(i).toString(16).padStart(2, "0"));
  }
  return hexBytes.join("").toUpperCase();
}

function calculateFingerprint(cert: forge.pki.Certificate): string {
  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(derBytes);
  return md
    .digest()
    .toHex()
    .match(/.{2}/g)!
    .join(":")
    .toUpperCase();
}

function buildSanEntries(commonName: string, sans: string[], ipAddresses: string[]): Array<{ type: number; value?: string; ip?: string }> {
  const entries: Array<{ type: number; value?: string; ip?: string }> = [];
  if (commonName) {
    const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(commonName);
    if (!isIp) {
      entries.push({ type: 2, value: commonName });
    }
  }
  sans.forEach((dns) => {
    if (dns !== commonName) {
      entries.push({ type: 2, value: dns });
    }
  });
  ipAddresses.forEach((ip) => {
    entries.push({ type: 7, ip });
  });
  return entries;
}

function buildServerExtensions(
  commonName: string,
  sans: string[],
  ipAddresses: string[],
  caSKI?: string
): any[] {
  const exts: any[] = [
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true, critical: true },
    { name: "extKeyUsage", serverAuth: true, clientAuth: true },
    { name: "subjectKeyIdentifier" },
  ];
  if (caSKI) {
    exts.push({
      name: "authorityKeyIdentifier",
      keyIdentifier: forge.util.hexToBytes(caSKI),
    });
  }
  const sanEntries = buildSanEntries(commonName, sans, ipAddresses);
  if (sanEntries.length > 0) {
    exts.push({ name: "subjectAltName", altNames: sanEntries });
  }
  return exts;
}

function generateSelfSigned(options: CertOptions): GeneratedCert {
  const {
    commonName,
    organization = "Local Development",
    country = "CN",
    state = "Beijing",
    locality = "Beijing",
    certDays = 365,
    keySize = 2048,
    sans = [],
    ipAddresses = [],
  } = options;

  const keys = forge.pki.rsa.generateKeyPair(keySize);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerialNumber();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + certDays);

  const attrs = [
    { name: "commonName", value: commonName },
    { name: "countryName", value: country },
    { name: "stateOrProvinceName", value: state },
    { name: "localityName", value: locality },
    { name: "organizationName", value: organization },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  const exts: any[] = [
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true, keyCertSign: true, cRLSign: true, critical: true },
    { name: "extKeyUsage", serverAuth: true, clientAuth: true },
    { name: "subjectKeyIdentifier" },
  ];

  const sanEntries = buildSanEntries(commonName, sans, ipAddresses);
  if (sanEntries.length > 0) {
    exts.push({ name: "subjectAltName", altNames: sanEntries });
  }

  cert.setExtensions(exts);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = keys.publicKey;
  csr.setSubject(attrs);
  csr.sign(keys.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const csrPem = forge.pki.certificationRequestToPem(csr);
  const fingerprint = calculateFingerprint(cert);

  return {
    mode: "self-signed",
    serverCertificate: certPem,
    serverPrivateKey: keyPem,
    csr: csrPem,
    serverInfo: {
      commonName,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
      keySize,
      algorithm: "RSA",
      sans,
      ipAddresses,
      serialNumber: cert.serialNumber,
      fingerprint,
    },
  };
}

function generateCaChain(options: CertOptions): GeneratedCert {
  const {
    commonName,
    organization = "Local Development CA",
    country = "CN",
    state = "Beijing",
    locality = "Beijing",
    caDays = 3650,
    certDays = 365,
    keySize = 2048,
    sans = [],
    ipAddresses = [],
  } = options;

  const caKeys = forge.pki.rsa.generateKeyPair(keySize);
  const caCert = forge.pki.createCertificate();
  caCert.publicKey = caKeys.publicKey;
  caCert.serialNumber = generateSerialNumber();
  caCert.validity.notBefore = new Date();
  caCert.validity.notAfter = new Date();
  caCert.validity.notAfter.setDate(caCert.validity.notBefore.getDate() + caDays);

  const caAttrs = [
    { name: "commonName", value: `${organization} Root CA` },
    { name: "countryName", value: country },
    { name: "stateOrProvinceName", value: state },
    { name: "localityName", value: locality },
    { name: "organizationName", value: organization },
    { name: "organizationalUnitName", value: "Local Development" },
  ];

  caCert.setSubject(caAttrs);
  caCert.setIssuer(caAttrs);
  caCert.setExtensions([
    { name: "basicConstraints", cA: true, critical: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, critical: true },
    { name: "subjectKeyIdentifier" },
  ]);
  caCert.sign(caKeys.privateKey, forge.md.sha256.create());

  const serverKeys = forge.pki.rsa.generateKeyPair(keySize);
  const serverCert = forge.pki.createCertificate();
  serverCert.publicKey = serverKeys.publicKey;
  serverCert.serialNumber = generateSerialNumber();
  serverCert.validity.notBefore = new Date();
  serverCert.validity.notAfter = new Date();
  serverCert.validity.notAfter.setDate(serverCert.validity.notBefore.getDate() + certDays);

  const serverAttrs = [
    { name: "commonName", value: commonName },
    { name: "countryName", value: country },
    { name: "stateOrProvinceName", value: state },
    { name: "localityName", value: locality },
    { name: "organizationName", value: organization },
  ];

  serverCert.setSubject(serverAttrs);
  serverCert.setIssuer(caCert.subject.attributes);

  const caSKIExt = caCert.extensions.find((ext) => ext.name === "subjectKeyIdentifier");
  const caSKI = caSKIExt && "subjectKeyIdentifier" in caSKIExt ? (caSKIExt.subjectKeyIdentifier as string) : undefined;

  const serverExts = buildServerExtensions(commonName, sans, ipAddresses, caSKI);
  serverCert.setExtensions(serverExts);
  serverCert.sign(caKeys.privateKey, forge.md.sha256.create());

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = serverKeys.publicKey;
  csr.setSubject(serverAttrs);
  csr.sign(serverKeys.privateKey, forge.md.sha256.create());

  const caCertPem = forge.pki.certificateToPem(caCert);
  const caKeyPem = forge.pki.privateKeyToPem(caKeys.privateKey);
  const serverCertPem = forge.pki.certificateToPem(serverCert);
  const serverKeyPem = forge.pki.privateKeyToPem(serverKeys.privateKey);
  const csrPem = forge.pki.certificationRequestToPem(csr);

  return {
    mode: "ca-chain",
    caCertificate: caCertPem,
    caPrivateKey: caKeyPem,
    serverCertificate: serverCertPem,
    serverPrivateKey: serverKeyPem,
    csr: csrPem,
    caInfo: {
      commonName: `${organization} Root CA`,
      organization,
      validFrom: caCert.validity.notBefore.toISOString(),
      validTo: caCert.validity.notAfter.toISOString(),
      keySize,
      serialNumber: caCert.serialNumber,
      fingerprint: calculateFingerprint(caCert),
    },
    serverInfo: {
      commonName,
      validFrom: serverCert.validity.notBefore.toISOString(),
      validTo: serverCert.validity.notAfter.toISOString(),
      keySize,
      algorithm: "RSA",
      sans,
      ipAddresses,
      serialNumber: serverCert.serialNumber,
      fingerprint: calculateFingerprint(serverCert),
    },
  };
}

function signWithExistingCa(options: CertOptions): GeneratedCert {
  const {
    commonName,
    organization = "Local Development",
    country = "CN",
    state = "Beijing",
    locality = "Beijing",
    certDays = 365,
    keySize = 2048,
    sans = [],
    ipAddresses = [],
    existingCaCert,
    existingCaKey,
  } = options;

  if (!existingCaCert || !existingCaKey) {
    throw new Error("Existing CA certificate and key are required");
  }

  const caCert = forge.pki.certificateFromPem(existingCaCert);
  const caKey = forge.pki.privateKeyFromPem(existingCaKey);

  const serverKeys = forge.pki.rsa.generateKeyPair(keySize);
  const serverCert = forge.pki.createCertificate();
  serverCert.publicKey = serverKeys.publicKey;
  serverCert.serialNumber = generateSerialNumber();
  serverCert.validity.notBefore = new Date();
  serverCert.validity.notAfter = new Date();
  serverCert.validity.notAfter.setDate(serverCert.validity.notBefore.getDate() + certDays);

  const serverAttrs = [
    { name: "commonName", value: commonName },
    { name: "countryName", value: country },
    { name: "stateOrProvinceName", value: state },
    { name: "localityName", value: locality },
    { name: "organizationName", value: organization },
  ];

  serverCert.setSubject(serverAttrs);
  serverCert.setIssuer(caCert.subject.attributes);

  const caSKIExt = caCert.extensions.find((ext) => ext.name === "subjectKeyIdentifier");
  const caSKI = caSKIExt && "subjectKeyIdentifier" in caSKIExt ? (caSKIExt.subjectKeyIdentifier as string) : undefined;

  const serverExts = buildServerExtensions(commonName, sans, ipAddresses, caSKI);
  serverCert.setExtensions(serverExts);
  serverCert.sign(caKey, forge.md.sha256.create());

  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = serverKeys.publicKey;
  csr.setSubject(serverAttrs);
  csr.sign(serverKeys.privateKey, forge.md.sha256.create());

  const caCertPem = forge.pki.certificateToPem(caCert);
  const serverCertPem = forge.pki.certificateToPem(serverCert);
  const serverKeyPem = forge.pki.privateKeyToPem(serverKeys.privateKey);
  const csrPem = forge.pki.certificationRequestToPem(csr);

  return {
    mode: "ca-chain",
    caCertificate: caCertPem,
    serverCertificate: serverCertPem,
    serverPrivateKey: serverKeyPem,
    csr: csrPem,
    caInfo: {
      commonName: (caCert.subject.getField("CN")?.value as string) || "Unknown CA",
      organization: (caCert.subject.getField("O")?.value as string) || "",
      validFrom: caCert.validity.notBefore.toISOString(),
      validTo: caCert.validity.notAfter.toISOString(),
      keySize: caKey.n ? (caKey.n.bitLength() ?? 0) : 0,
      serialNumber: caCert.serialNumber,
      fingerprint: calculateFingerprint(caCert),
    },
    serverInfo: {
      commonName,
      validFrom: serverCert.validity.notBefore.toISOString(),
      validTo: serverCert.validity.notAfter.toISOString(),
      keySize,
      algorithm: "RSA",
      sans,
      ipAddresses,
      serialNumber: serverCert.serialNumber,
      fingerprint: calculateFingerprint(serverCert),
    },
  };
}

export function generateCertificate(options: CertOptions): GeneratedCert {
  if (options.mode === "self-signed") {
    return generateSelfSigned(options);
  }
  if (options.existingCaCert && options.existingCaKey) {
    return signWithExistingCa(options);
  }
  return generateCaChain(options);
}

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "application/x-x509-ca-cert;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadAllFiles(cert: GeneratedCert, usedExistingCa?: boolean) {
  const files: { content: string; name: string }[] = [];
  if (cert.mode === "ca-chain" && cert.caCertificate && cert.caPrivateKey && !usedExistingCa) {
    files.push({ content: cert.caCertificate, name: "root-ca.crt" });
    files.push({ content: cert.caPrivateKey, name: "root-ca.key" });
  }
  files.push({ content: cert.serverCertificate, name: "server.crt" });
  files.push({ content: cert.serverPrivateKey, name: "server.key" });
  files.push({ content: cert.csr, name: "server.csr" });
  files.forEach((file, index) => {
    setTimeout(() => downloadFile(file.content, file.name), index * 300);
  });
}

export function validateCaCertAndKey(caCertPem: string, caKeyPem: string): { valid: boolean; error?: string } {
  try {
    const caCert = forge.pki.certificateFromPem(caCertPem);
    const caKey = forge.pki.privateKeyFromPem(caKeyPem);

    const keyPubKey = forge.pki.setRsaPublicKey(caKey.n, caKey.e);
    const certPubKey = caCert.publicKey as forge.pki.rsa.PublicKey;

    if (certPubKey.n.toString() !== keyPubKey.n.toString() ||
        certPubKey.e.toString() !== keyPubKey.e.toString()) {
      return { valid: false, error: "CA 证书与私钥不匹配" };
    }

    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message || "CA 证书或私钥格式无效" };
  }
}
