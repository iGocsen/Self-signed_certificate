import { useState, useCallback, useRef, useEffect } from "react";
import {
  Shield,
  Key,
  Download,
  Copy,
  Check,
  Terminal,
  Globe,
  Network,
  Info,
  Lock,
  FileText,
  ChevronDown,
  Sparkles,
  AlertTriangle,
  Server,
  Layers,
  ArrowDown,
  FileKey,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateCertificate, downloadFile, downloadAllFiles, validateCaCertAndKey, type GeneratedCert, type CertOptions, type CertMode } from "@/lib/cert-generator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TabType = "domain" | "ip" | "multi";
type PemTabType = "ca-cert" | "ca-key" | "server-cert" | "server-key" | "csr";

interface TerminalLine {
  text: string;
  type: "info" | "success" | "warning" | "error";
  delay: number;
}

const TERMINAL_LINES: TerminalLine[] = [
  { text: "$ Initializing certificate generator...", type: "info", delay: 0 },
  { text: "  ✓ Loading cryptographic modules", type: "success", delay: 200 },
  { text: "  ✓ Generating RSA key pair...", type: "success", delay: 400 },
  { text: "  ✓ Building X.509 certificate with SANs", type: "success", delay: 600 },
  { text: "  ✓ Signing certificate with SHA-256", type: "success", delay: 800 },
  { text: "  ✓ Certificate generated successfully", type: "success", delay: 1000 },
  { text: "$ Ready.", type: "info", delay: 1200 },
];

function TerminalOutput({ lines, isActive }: { lines: TerminalLine[]; isActive: boolean }) {
  const [visibleLines, setVisibleLines] = useState<TerminalLine[]>([]);

  useEffect(() => {
    if (!isActive) {
      setVisibleLines([]);
      return;
    }
    setVisibleLines([]);
    const timers: NodeJS.Timeout[] = [];
    lines.forEach((line) => {
      const timer = setTimeout(() => {
        setVisibleLines((prev) => [...prev, line]);
      }, line.delay);
      timers.push(timer);
    });
    return () => timers.forEach(clearTimeout);
  }, [isActive, lines]);

  return (
    <div className="font-mono text-sm bg-black/40 rounded-lg p-4 min-h-[180px] border border-border/50 relative overflow-hidden scanline">
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border/30">
        <div className="w-3 h-3 rounded-full bg-red-500/80" />
        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
        <div className="w-3 h-3 rounded-full bg-green-500/80" />
        <span className="ml-2 text-xs text-muted-foreground">terminal — cert-gen</span>
      </div>
      <div className="space-y-1">
        {visibleLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "animate-fade-in",
              line.type === "success" && "text-emerald-400",
              line.type === "warning" && "text-yellow-400",
              line.type === "error" && "text-red-400",
              line.type === "info" && "text-muted-foreground"
            )}
          >
            {line.text}
          </div>
        ))}
        {isActive && visibleLines.length < lines.length && (
          <span className="terminal-cursor text-emerald-400" />
        )}
      </div>
    </div>
  );
}

function CertPreview({ cert, usedExistingCa }: { cert: GeneratedCert; usedExistingCa: boolean }) {
  const [activeTab, setActiveTab] = useState<PemTabType>("server-cert");
  const [copiedTab, setCopiedTab] = useState<PemTabType | null>(null);

  const isCaChain = cert.mode === "ca-chain" && cert.caCertificate;

  // Determine which tabs to show
  const tabsToShow: PemTabType[] = ["server-cert", "server-key", "csr"];
  if (isCaChain && !usedExistingCa) {
    tabsToShow.unshift("ca-cert", "ca-key");
  }

  const contentMap: Record<PemTabType, string> = {
    "ca-cert": cert.caCertificate || "",
    "ca-key": cert.caPrivateKey || "",
    "server-cert": cert.serverCertificate,
    "server-key": cert.serverPrivateKey,
    "csr": cert.csr,
  };

  const labelMap: Record<PemTabType, string> = {
    "ca-cert": "root-ca.crt",
    "ca-key": "root-ca.key",
    "server-cert": "server.crt",
    "server-key": "server.key",
    "csr": "server.csr",
  };

  // Ensure active tab is in the visible tabs
  useEffect(() => {
    if (!tabsToShow.includes(activeTab)) {
      setActiveTab("server-cert");
    }
  }, [tabsToShow, activeTab]);

  const handleCopy = async (tab: PemTabType) => {
    try {
      const text = contentMap[tab];
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.top = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedTab(tab);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopiedTab(null), 2000);
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {isCaChain && (
        <div className="bg-card/50 border border-border/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold">信任链</span>
          </div>
          <div className="flex items-center gap-2 text-sm overflow-x-auto pb-1">
            <div className="flex flex-col items-center bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-2 flex-shrink-0">
              <Shield className="w-5 h-5 text-emerald-400 mb-1" />
              <span className="font-semibold text-emerald-400 whitespace-nowrap">Root CA</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">自签名</span>
            </div>
            <div className="flex flex-col items-center text-muted-foreground flex-shrink-0">
              <ArrowDown className="w-5 h-5" />
              <span className="text-xs whitespace-nowrap">签发</span>
            </div>
            <div className="flex flex-col items-center bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2 flex-shrink-0">
              <Server className="w-5 h-5 text-blue-400 mb-1" />
              <span className="font-semibold text-blue-400 whitespace-nowrap">Server Cert</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{cert.serverInfo.commonName}</span>
            </div>
            <div className="flex flex-col items-center text-muted-foreground flex-shrink-0">
              <ArrowDown className="w-5 h-5" />
              <span className="text-xs whitespace-nowrap">安装到</span>
            </div>
            <div className="flex flex-col items-center bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-2 flex-shrink-0">
              <Lock className="w-5 h-5 text-amber-400 mb-1" />
              <span className="font-semibold text-amber-400 whitespace-nowrap">信任存储</span>
              <span className="text-xs text-muted-foreground whitespace-nowrap">受信任根CA</span>
            </div>
          </div>
        </div>
      )}

      {!isCaChain && (
        <div className="bg-card/50 border border-border/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold">自签名证书</span>
            <Badge variant="outline" className="ml-auto text-xs border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
              单证书模式
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            此证书同时作为 CA 和服务器证书。直接将此证书安装到系统的「受信任的根证书颁发机构」即可被浏览器信任。
          </p>
        </div>
      )}

      {isCaChain && cert.caInfo && !usedExistingCa && (
        <div className="bg-card/50 border border-emerald-500/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold">Root CA 证书</span>
            <Badge variant="outline" className="ml-auto text-xs border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
              需要安装到信任存储
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">名称</span>
              <p className="font-mono text-xs mt-0.5">{cert.caInfo.commonName}</p>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">有效期至</span>
              <p className="font-mono text-xs mt-0.5">
                {new Date(cert.caInfo.validTo).toLocaleDateString("zh-CN")}
              </p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground text-xs">SHA-256 指纹</span>
              <p className="font-mono text-xs mt-0.5 break-all text-muted-foreground/70">
                {cert.caInfo.fingerprint}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card/50 border border-blue-500/20 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Server className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold">服务器证书</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <div>
            <span className="text-muted-foreground text-xs">密钥长度</span>
            <p className="font-semibold text-sm">{cert.serverInfo.keySize} bit</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">有效期至</span>
            <p className="font-semibold text-sm">
              {new Date(cert.serverInfo.validTo).toLocaleDateString("zh-CN")}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">序列号</span>
            <p className="font-mono text-xs truncate">{cert.serverInfo.serialNumber}</p>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">算法</span>
            <p className="font-semibold text-sm">{cert.serverInfo.algorithm}</p>
          </div>
        </div>

        {/* SHA-256 Fingerprint - always shown */}
        <div className="mb-3">
          <span className="text-muted-foreground text-xs">SHA-256 指纹</span>
          <p className="font-mono text-xs mt-0.5 break-all text-muted-foreground/70">
            {cert.serverInfo.fingerprint}
          </p>
        </div>

        {(cert.serverInfo.sans.length > 0 || cert.serverInfo.ipAddresses.length > 0) && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Subject Alternative Names (包含 CN)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {cert.serverInfo.sans.map((dns) => (
                <Badge
                  key={dns}
                  variant="outline"
                  className="bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
                >
                  <Globe className="w-3 h-3 mr-1" />
                  {dns}
                </Badge>
              ))}
              {cert.serverInfo.ipAddresses.map((ip) => (
                <Badge
                  key={ip}
                  variant="outline"
                  className="bg-blue-400/10 text-blue-400 border-blue-400/20"
                >
                  <Network className="w-3 h-3 mr-1" />
                  {ip}
                </Badge>
              ))}
            </div>
          </>
        )}
      </div>

      {/* PEM Area - Fixed width, fixed action buttons */}
      <div className="border border-border/50 rounded-lg overflow-hidden pem-area">
        {/* Tab bar with fixed action buttons on the right */}
        <div className="flex items-center justify-between bg-secondary/50 border-b border-border/50">
          <div className="flex items-center overflow-x-auto flex-1 min-w-0">
            {tabsToShow.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-3 py-2 text-xs font-mono transition-colors relative whitespace-nowrap flex-shrink-0",
                  activeTab === tab
                    ? "text-emerald-400 bg-emerald-400/5"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {labelMap[tab]}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
                )}
              </button>
            ))}
          </div>
          {/* Fixed action buttons - always visible, never scroll */}
          <div className="flex items-center gap-1 pr-2 flex-shrink-0 ml-auto">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => handleCopy(activeTab)}
            >
              {copiedTab === activeTab ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              复制
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => downloadFile(contentMap[activeTab], labelMap[activeTab])}
            >
              <Download className="w-3.5 h-3.5" />
              下载
            </Button>
          </div>
        </div>
        {/* PEM content - full width, vertical scroll only */}
        <div className="relative">
          <pre className="p-4 text-xs font-mono text-muted-foreground overflow-y-auto max-h-64 bg-black/20 whitespace-pre-wrap break-all">
            {contentMap[activeTab]}
          </pre>
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
          onClick={() => {
            downloadAllFiles(cert, usedExistingCa);
            toast.success("所有文件已开始下载");
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          下载全部文件
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("domain");
  const [certMode, setCertMode] = useState<CertMode>("self-signed");
  const [commonName, setCommonName] = useState("");
  const [organization, setOrganization] = useState("Local Development");
  const [country, setCountry] = useState("CN");
  const [state, setState] = useState("Beijing");
  const [locality, setLocality] = useState("Beijing");
  const [email, setEmail] = useState("");
  const [caDays, setCaDays] = useState("3650");
  const [certDays, setCertDays] = useState("365");
  const [keySize, setKeySize] = useState("2048");
  const [sansInput, setSansInput] = useState("");
  const [ipInput, setIpInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCert, setGeneratedCert] = useState<GeneratedCert | null>(null);
  const [usedExistingCa, setUsedExistingCa] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [existingCaCert, setExistingCaCert] = useState("");
  const [existingCaKey, setExistingCaKey] = useState("");
  const [caCommonName, setCaCommonName] = useState("");
  const [caOu, setCaOu] = useState("");
  const terminalRef = useRef<HTMLDivElement>(null);

  const parseList = (input: string): string[] =>
    input
      .split(/[,，\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleGenerate = useCallback(() => {
    // Validate required fields
    if (!commonName.trim()) {
      toast.error("请填写通用名称 (Common Name)");
      return;
    }

    // Validate SAN input format
    if (sansInput.trim()) {
      const sans = parseList(sansInput);
      for (const san of sans) {
        if (!/^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/.test(san)) {
          toast.error(`其他域名 (SAN) 格式无效：${san}`);
          return;
        }
      }
    }

    // Validate IP input format
    if (ipInput.trim()) {
      const ips = parseList(ipInput);
      for (const ip of ips) {
        // IPv4
        if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
          // IPv6
          if (!/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(ip) &&
              !/^([0-9a-fA-F]{1,4}:){1,7}:$/.test(ip) &&
              !/^::1$/.test(ip) &&
              !/^::$/.test(ip)) {
            toast.error(`IP 地址格式无效：${ip}`);
            return;
          }
        }
      }
    }

    // Validate existing CA cert format
    if (certMode === "ca-chain" && existingCaCert.trim() && !existingCaKey.trim()) {
      toast.error("提供了 CA 证书但未提供 CA 私钥");
      return;
    }

    if (certMode === "ca-chain" && existingCaKey.trim() && !existingCaCert.trim()) {
      toast.error("提供了 CA 私钥但未提供 CA 证书");
      return;
    }

    // Validate existing CA cert and key pairing if both provided
    if (certMode === "ca-chain" && existingCaCert.trim() && existingCaKey.trim()) {
      if (!existingCaCert.trim().includes("-----BEGIN CERTIFICATE-----")) {
        toast.error("Root CA 证书 (PEM) 格式无效：缺少 BEGIN CERTIFICATE 标记");
        return;
      }
      if (!existingCaKey.trim().includes("-----BEGIN") || !existingCaKey.trim().includes("PRIVATE KEY-----")) {
        toast.error("Root CA 私钥 (PEM) 格式无效：缺少 PRIVATE KEY 标记");
        return;
      }
      const validation = validateCaCertAndKey(existingCaCert.trim(), existingCaKey.trim());
      if (!validation.valid) {
        toast.error(`CA 验证失败：${validation.error}`);
        return;
      }
    }

    setIsGenerating(true);
    setGeneratedCert(null);
    setUsedExistingCa(false);

    setTimeout(() => {
      const options: CertOptions = {
        mode: certMode,
        commonName: commonName.trim(),
        organization: organization.trim() || "Local Development",
        country: country.trim() || "CN",
        state: state.trim() || "Beijing",
        locality: locality.trim() || "Beijing",
        email: email.trim() || undefined,
        caDays: parseInt(caDays) || 3650,
        certDays: parseInt(certDays) || 365,
        keySize: parseInt(keySize) || 2048,
        sans: parseList(sansInput),
        ipAddresses: parseList(ipInput),
        existingCaCert: existingCaCert.trim() || undefined,
        existingCaKey: existingCaKey.trim() || undefined,
        caCommonName: caCommonName.trim() || undefined,
        caOu: caOu.trim() || undefined,
      };

      try {
        const cert = generateCertificate(options);
        setGeneratedCert(cert);
        setUsedExistingCa(!!(existingCaCert.trim() && existingCaKey.trim()));
        toast.success("证书生成成功！");
      } catch (e: any) {
        toast.error(e.message || "证书生成失败，请检查输入");
        console.error(e);
      } finally {
        setIsGenerating(false);
      }
    }, 1500);
  }, [certMode, commonName, organization, country, state, locality, email, caDays, certDays, keySize, sansInput, ipInput, existingCaCert, existingCaKey, caCommonName, caOu]);

  const quickPresets = [
    { label: "localhost", cn: "localhost", domains: "", ips: "127.0.0.1, ::1" },
    { label: "开发服务器", cn: "dev.local", domains: "*.dev.local", ips: "192.168.1.100" },
    { label: "Docker 环境", cn: "docker.local", domains: "*.docker.local", ips: "172.17.0.1, 172.18.0.1" },
    { label: "Kubernetes", cn: "kubernetes.default.svc", domains: "*.svc.cluster.local", ips: "10.96.0.1" },
  ];

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background bg-grid-pattern relative">
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <header className="relative border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">
                  <span className="text-emerald-400">Local</span>Cert
                </h1>
                <p className="text-xs text-muted-foreground">本地 SSL 证书生成器</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
              <Sparkles className="w-3 h-3 mr-1" />
              浏览器端生成
            </Badge>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="text-center mb-10 animate-slide-up">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              生成本地 <span className="text-emerald-400">SSL/TLS</span> 证书
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              为 IP 地址和本地域名快速生成证书，所有操作在浏览器本地完成。
              支持自签名证书、CA 证书链，以及使用已有 CA 签发新证书。
              SAN 自动包含 CN，确保所有现代浏览器都能正确验证。
            </p>
          </div>

          <div className="grid lg:grid-cols-4 gap-8">
            <div className="lg:col-span-2 space-y-6">
              {/* Cert Mode Selection */}
              <div className="bg-card border border-border/50 rounded-xl p-1 flex gap-1">
                {[
                  { id: "self-signed" as CertMode, icon: Shield, label: "自签名证书", desc: "单证书，简单快速" },
                  { id: "ca-chain" as CertMode, icon: Layers, label: "CA 证书链", desc: "Root CA + Server Cert" },
                ].map(({ id, icon: Icon, label, desc }) => (
                  <button
                    key={id}
                    onClick={() => setCertMode(id)}
                    className={cn(
                      "flex-1 flex flex-col items-center justify-center gap-1 py-3 px-4 rounded-lg text-sm transition-all",
                      certMode === id
                        ? "bg-emerald-500/10 text-emerald-400 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{label}</span>
                    <span className="text-xs opacity-60">{desc}</span>
                  </button>
                ))}
              </div>

              {/* Domain / IP / Multi tabs */}
              <div className="bg-card border border-border/50 rounded-xl p-1 flex gap-1">
                {[
                  { id: "domain" as TabType, icon: Globe, label: "本地域名" },
                  { id: "ip" as TabType, icon: Network, label: "IP 地址" },
                  { id: "multi" as TabType, icon: FileText, label: "多名称" },
                ].map(({ id, icon: Icon, label }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all",
                      activeTab === id
                        ? "bg-emerald-500/10 text-emerald-400 shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">快速预设</Label>
                <div className="flex flex-wrap gap-2">
                  {quickPresets.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setCommonName(preset.cn);
                        setSansInput(preset.domains);
                        setIpInput(preset.ips);
                      }}
                      className="px-3 py-1.5 text-xs rounded-md bg-secondary/50 border border-border/50 text-muted-foreground hover:text-foreground hover:border-emerald-500/30 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form */}
              <div className="bg-card border border-border/50 rounded-xl p-6 space-y-5">
                {/* Common Name */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="cn">
                      {activeTab === "ip" ? "主要 IP 地址" : "通用名称 (Common Name)"}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p className="text-xs max-w-[200px]">
                          CN 会自动添加到 SAN 中，确保浏览器能正确验证。
                          访问的域名必须与 CN 或 SAN 中的任一名称匹配。
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Input
                    id="cn"
                    placeholder={
                      activeTab === "ip"
                        ? "192.168.1.100"
                        : activeTab === "domain"
                        ? "localhost"
                        : "example.local"
                    }
                    value={commonName}
                    onChange={(e) => setCommonName(e.target.value)}
                    className="bg-background/50 font-mono"
                  />
                </div>

                {/* SANs - Domain names */}
                {(activeTab === "domain" || activeTab === "multi") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="sans">其他域名 (SAN)</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-3.5 h-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-xs max-w-[200px]">
                            用逗号分隔多个域名，支持通配符如 *.example.local。
                            CN 会自动加入 SAN，无需重复填写。
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Textarea
                      id="sans"
                      placeholder="*.dev.local, app.example.local"
                      value={sansInput}
                      onChange={(e) => setSansInput(e.target.value)}
                      className="bg-background/50 font-mono min-h-[80px] resize-none"
                      rows={3}
                    />
                  </div>
                )}

                {/* IP Addresses */}
                {(activeTab === "ip" || activeTab === "multi") && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="ips">IP 地址</Label>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-3.5 h-3.5 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="text-xs">用逗号分隔多个 IPv4 / IPv6 地址</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Textarea
                      id="ips"
                      placeholder="127.0.0.1, 192.168.1.100, 10.0.0.1"
                      value={ipInput}
                      onChange={(e) => setIpInput(e.target.value)}
                      className="bg-background/50 font-mono min-h-[80px] resize-none"
                      rows={3}
                    />
                  </div>
                )}

                {/* Existing CA input */}
                {certMode === "ca-chain" && (
                  <div className="space-y-3 p-4 bg-secondary/30 border border-border/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <FileKey className="w-4 h-4 text-emerald-400" />
                      <Label className="text-sm font-semibold">使用已有 CA 签发（可选）</Label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      如果你已有 Root CA 证书和私钥，粘贴到下方可使用已有 CA 签发新证书。
                      留空则自动生成新的 Root CA。
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="ca-cert-input" className="text-xs">Root CA 证书 (PEM)</Label>
                      <Textarea
                        id="ca-cert-input"
                        placeholder="-----BEGIN CERTIFICATE-----&#10;MIID..."
                        value={existingCaCert}
                        onChange={(e) => setExistingCaCert(e.target.value)}
                        className="bg-background/50 font-mono text-xs min-h-[80px] resize-none"
                        rows={4}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ca-key-input" className="text-xs">Root CA 私钥 (PEM)</Label>
                      <Textarea
                        id="ca-key-input"
                        placeholder="-----BEGIN PRIVATE KEY-----&#10;MIIE..."
                        value={existingCaKey}
                        onChange={(e) => setExistingCaKey(e.target.value)}
                        className="bg-background/50 font-mono text-xs min-h-[80px] resize-none"
                        rows={4}
                      />
                    </div>
                  </div>
                )}

                {/* Advanced Settings */}
                <div>
                  <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 transition-transform",
                        showAdvanced && "rotate-180"
                      )}
                    />
                    高级设置
                  </button>

                  {showAdvanced && (
                    <div className="mt-4 space-y-4 pl-6 border-l-2 border-border/50">
                      {/* CA Days - only shown for ca-chain mode */}
                      {certMode === "ca-chain" && (
                        <div className="space-y-2">
                          <Label htmlFor="ca-days">CA 有效期 (天)</Label>
                          <Input
                            id="ca-days"
                            type="number"
                            value={caDays}
                            onChange={(e) => setCaDays(e.target.value)}
                            className="bg-background/50 font-mono"
                          />
                          <p className="text-xs text-muted-foreground">建议 3650 天（10年）</p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="cert-days">服务器证书有效期 (天)</Label>
                        <Input
                          id="cert-days"
                          type="number"
                          value={certDays}
                          onChange={(e) => setCertDays(e.target.value)}
                          className="bg-background/50 font-mono"
                        />
                        <p className="text-xs text-muted-foreground">建议 365 天（1年）</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="keysize">密钥长度</Label>
                        <Select value={keySize} onValueChange={setKeySize}>
                          <SelectTrigger className="bg-background/50 font-mono">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2048">2048 bit</SelectItem>
                            <SelectItem value="4096">4096 bit</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Email - optional */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="email">邮箱 (可选)</Label>
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <Input
                          id="email"
                          type="email"
                          placeholder="admin@example.local"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="bg-background/50 font-mono"
                        />
                        <p className="text-xs text-muted-foreground">将作为 emailAddress 属性写入证书</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="org">组织名称</Label>
                        <Input
                          id="org"
                          value={organization}
                          onChange={(e) => setOrganization(e.target.value)}
                          className="bg-background/50"
                        />
                      </div>

                      {/* CA CN & OU customization - only for ca-chain mode when NOT using existing CA */}
                      {certMode === "ca-chain" && (
                        <div className="space-y-3 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                          <div className="flex items-center gap-2">
                            <Shield className="w-3.5 h-3.5 text-emerald-400" />
                            <Label className="text-xs font-semibold text-emerald-400">Root CA 自定义信息</Label>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            自定义 Root CA 的 Common Name 和 OU，留空则使用默认值。
                          </p>
                          <div className="space-y-2">
                            <Label htmlFor="ca-cn" className="text-xs">CA Common Name</Label>
                            <Input
                              id="ca-cn"
                              placeholder={`${organization} Root CA`}
                              value={caCommonName}
                              onChange={(e) => setCaCommonName(e.target.value)}
                              className="bg-background/50 font-mono text-xs"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="ca-ou" className="text-xs">CA Organizational Unit (OU)</Label>
                            <Input
                              id="ca-ou"
                              placeholder="Local Development"
                              value={caOu}
                              onChange={(e) => setCaOu(e.target.value)}
                              className="bg-background/50 font-mono text-xs"
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="country">国家代码</Label>
                          <Input
                            id="country"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            className="bg-background/50 font-mono"
                            maxLength={2}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="state">省份</Label>
                          <Input
                            id="state"
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            className="bg-background/50"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="locality">城市</Label>
                          <Input
                            id="locality"
                            value={locality}
                            onChange={(e) => setLocality(e.target.value)}
                            className="bg-background/50"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Generate Button */}
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !commonName.trim()}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-black font-semibold h-12 text-base"
                >
                  {isGenerating ? (
                    <>
                      <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
                      正在生成证书...
                    </>
                  ) : (
                    <>
                      <Shield className="w-5 h-5 mr-2" />
                      生成证书
                    </>
                  )}
                </Button>
              </div>

              {/* Terminal */}
              <div ref={terminalRef}>
                <TerminalOutput lines={TERMINAL_LINES} isActive={isGenerating} />
              </div>
            </div>

            {/* Right Panel - Result */}
            <div className="lg:col-span-2">
              <div className="sticky top-24 space-y-4">
                {!generatedCert && !isGenerating && (
                  <div className="bg-card/30 border border-border/30 rounded-xl p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center">
                      <Lock className="w-8 h-8 text-emerald-400/50" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">等待生成</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      配置左侧参数后点击"生成证书"
                    </p>

                    <Separator className="my-6" />

                    <div className="text-left space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-emerald-400 font-bold">1</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">选择证书模式</p>
                          <p className="text-xs text-muted-foreground">自签名 / CA 证书链</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-emerald-400 font-bold">2</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">填写域名或 IP</p>
                          <p className="text-xs text-muted-foreground">CN 会自动加入 SAN</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-emerald-400 font-bold">3</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">安装证书到信任存储</p>
                          <p className="text-xs text-muted-foreground">将证书添加到受信任根CA</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {isGenerating && (
                  <div className="bg-card/30 border border-emerald-500/20 rounded-xl p-8 text-center animate-pulse">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                      <div className="w-8 h-8 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                    </div>
                    <h3 className="text-lg font-semibold text-emerald-400 mb-2">正在生成</h3>
                    <p className="text-sm text-muted-foreground">
                      正在生成密钥对和证书...
                    </p>
                  </div>
                )}

                {generatedCert && !isGenerating && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-lg font-semibold">证书已生成</h3>
                    </div>
                    <CertPreview cert={generatedCert} usedExistingCa={usedExistingCa} />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Trust Guide */}
          <section className="mt-16 mb-8">
            <h3 className="text-2xl font-bold mb-2 text-center">
              如何让浏览器信任生成的证书
            </h3>
            <p className="text-muted-foreground text-center mb-8 max-w-xl mx-auto">
              将证书安装到系统的受信任根证书存储区后，浏览器会自动信任。
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Shield,
                  title: "Windows",
                  steps: [
                    "双击 .crt 文件",
                    "点击「安装证书」",
                    "选择「本地计算机」",
                    "选择「将所有的证书都放入下列存储」",
                    "点击「浏览」→ 选择「受信任的根证书颁发机构」",
                    "完成安装后重启浏览器",
                  ],
                  command: `# 或使用命令行（管理员）
certutil -addstore Root server.crt`,
                },
                {
                  icon: Key,
                  title: "macOS",
                  steps: [
                    "双击 .crt 打开钥匙串访问",
                    "选择「系统」钥匙串",
                    "找到刚添加的证书，双击打开",
                    "展开「信任」部分",
                    "将「使用此证书时」设为「始终信任」",
                    "关闭并输入密码确认",
                  ],
                  command: `# 或使用命令行
sudo security add-trusted-cert \\
  -d -r trustRoot \\
  -k /Library/Keychains/System.keychain \\
  server.crt`,
                },
                {
                  icon: Terminal,
                  title: "Linux (Debian/Ubuntu)",
                  steps: [
                    "将 .crt 复制到 /usr/local/share/ca-certificates/",
                    "运行 sudo update-ca-certificates",
                    "Firefox 需要单独导入：设置 → 隐私与安全 → 查看证书 → 导入",
                  ],
                  command: `sudo cp server.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates`,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card border border-border/50 rounded-xl p-5 space-y-3 glow-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h4 className="font-semibold">{item.title}</h4>
                  </div>
                  <ol className="text-sm space-y-1.5 text-muted-foreground">
                    {item.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-400 font-mono text-xs mt-0.5">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  <pre className="text-xs font-mono text-muted-foreground bg-black/30 rounded-lg p-3 overflow-x-auto mt-3">
                    {item.command}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          {/* Server Usage Guide */}
          <section className="mb-8">
            <h3 className="text-2xl font-bold mb-6 text-center">
              服务器配置示例
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: Terminal,
                  title: "Node.js / Express",
                  code: `const https = require('https');
const fs = require('fs');

https.createServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.crt'),
}, app).listen(443);`,
                },
                {
                  icon: Globe,
                  title: "Nginx",
                  code: `server {
  listen 443 ssl;
  server_name localhost;

  ssl_certificate     server.crt;
  ssl_certificate_key server.key;

  location / {
    proxy_pass http://localhost:3000;
  }
}`,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card border border-border/50 rounded-xl p-5 space-y-3 glow-border"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                      <item.icon className="w-4 h-4 text-emerald-400" />
                    </div>
                    <h4 className="font-semibold">{item.title}</h4>
                  </div>
                  <pre className="text-xs font-mono text-muted-foreground bg-black/30 rounded-lg p-3 overflow-x-auto">
                    {item.code}
                  </pre>
                </div>
              ))}
            </div>
          </section>

          {/* Security Notice */}
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-5 flex items-start gap-3 mb-8">
            <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-yellow-500 mb-2">安全提示</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 此工具生成的证书仅适用于本地开发环境</li>
                <li>• Root CA 私钥应妥善保管，不要泄露</li>
                <li>• 生产环境请使用 Let's Encrypt 或商业 CA 签发的证书</li>
                <li>• 所有生成过程在浏览器本地完成，私钥不会传输到任何服务器</li>
                <li>• 确保证书已安装到「受信任的根证书颁发机构」而非「个人」</li>
                <li>• 访问的域名必须与证书的 CN 或 SAN 完全匹配</li>
              </ul>
            </div>
          </div>
        </main>

        <footer className="border-t border-border/50 py-6">
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>LocalCert — 浏览器端本地 SSL 证书生成器</span>
            </div>
            <span>数据完全本地处理，零网络传输</span>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
