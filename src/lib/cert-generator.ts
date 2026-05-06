import forge from "node-forge";

export interface CertOptions {
  commonName: string;
  organization?: string;
  country?: string;
  state?: string;
  locality?: string;
  days: number;
  keySize: number;
  sans: string[];
  ipAddresses: string[];
  algorithm: "RSA" | "EC";
}

export interface GeneratedCert {
  privateKey: string;
  certificate: string;
  csr: string;
  info: {
    commonName: string;
    organization: string;
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

export function generateCertificate(options: CertOptions): GeneratedCert {
  const {
    commonName,
    organization = "Local Development",
    country = "US",
    state = "California",
    locality = "San Francisco",
    days = 365,
    keySize = 2048,
    sans = [],
    ipAddresses = [],
  } = options;

  // Generate RSA key pair
  const rsaKey = forge.pki.rsa.generateKeyPair(keySize);
  const privateKeyPem = forge.pki.privateKeyToPem(rsaKey.privateKey);

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = rsaKey.publicKey;
  cert.serialNumber = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16).toUpperCase();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + days);

  // Subject attributes
  const attrs = [
    { name: "commonName", value: commonName },
    { name: "countryName", value: country },
    { name: "stateOrProvinceName", value: state },
    { name: "localityName", value: locality },
    { name: "organizationName", value: organization },
  ];

  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed

  // Extensions
  const exts: any[] = [
    {
      name: "basicConstraints",
      cA: true,
      critical: true,
    },
    {
      name: "keyUsage",
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
      critical: true,
    },
    {
      name: "extKeyUsage",
      serverAuth: true,
      clientAuth: true,
      codeSigning: true,
      emailProtection: true,
      timeStamping: true,
    },
    {
      name: "nsCertType",
      client: true,
      server: true,
      email: true,
      objsign: true,
      sslCA: true,
      emailCA: true,
      objCA: true,
    },
  ];

  // Add SANs
  const sanNames: Array<{ type: number; value: string }> = [];

  sans.forEach((dns) => {
    sanNames.push({ type: 2, value: dns }); // dNSName
  });

  ipAddresses.forEach((ip) => {
    sanNames.push({ type: 7, ip });
  });

  if (sanNames.length > 0) {
    exts.push({
      name: "subjectAltName",
      altNames: sanNames,
    });
  }

  cert.setExtensions(exts);

  // Self-sign
  cert.sign(rsaKey.privateKey, forge.md.sha256.create());

  const certPem = forge.pki.certificateToPem(cert);

  // Generate CSR
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = rsaKey.publicKey;
  csr.setSubject(attrs);
  csr.sign(rsaKey.privateKey, forge.md.sha256.create());
  const csrPem = forge.pki.certificationRequestToPem(csr);

  // Calculate fingerprint
  const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const md = forge.md.sha256.create();
  md.update(derBytes);
  const fingerprint = md
    .digest()
    .toHex()
    .match(/.{2}/g)!
    .join(":")
    .toUpperCase();

  return {
    privateKey: privateKeyPem,
    certificate: certPem,
    csr: csrPem,
    info: {
      commonName,
      organization,
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

export function downloadFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadZip(certificate: GeneratedCert) {
  // Simple approach: download files individually
  downloadFile(certificate.privateKey, `${certificate.info.commonName}.key`);
  setTimeout(() => downloadFile(certificate.certificate, `${certificate.info.commonName}.crt`), 200);
  setTimeout(() => downloadFile(certificate.csr, `${certificate.info.commonName}.csr`), 400);
}
