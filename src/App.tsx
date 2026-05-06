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
  Clock,
  Info,
  Lock,
  FileText,
  ChevronDown,
  Sparkles,
  AlertTriangle,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { generateCertificate, downloadFile, type GeneratedCert, type CertOptions } from "@/lib/cert-generator";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type TabType = "domain" | "ip" | "multi";

interface TerminalLine {
  text: string;
  type: "info" | "success" | "warning" | "error";
  delay: number;
}

const TERMINAL_LINES: TerminalLine[] = [
  { text: "$ Initializing certificate generator...", type: "info", delay: 0 },
  { text: "  ✓ Loading cryptographic modules", type: "success", delay: 200 },
  { text: "  ✓ Generating RSA key pair...", type: "success", delay: 400 },
  { text: "  ✓ Computing prime factors...", type: "success", delay: 600 },
  { text: "  ✓ Building X.509 certificate structure", type: "success", delay: 800 },
  { text: "  ✓ Adding Subject Alternative Names", type: "success", delay: 1000 },
  { text: "  ✓ Self-signing with SHA-256", type: "success", delay: 1200 },
  { text: "  ✓ Certificate generated successfully", type: "success", delay: 1400 },
  { text: "$ Ready.", type: "info", delay: 1600 },
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
    <div className="font-mono text-sm bg-black/40 rounded-lg p-4 min-h-[200px] border border-border/50 relative overflow-hidden scanline">
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

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for environments where Clipboard API is blocked
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
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-400" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {label}
    </Button>
  );
}

function CertPreview({ cert }: { cert: GeneratedCert }) {
  const [activeTab, setActiveTab] = useState<"cert" | "key" | "csr">("cert");

  const contentMap = {
    cert: cert.certificate,
    key: cert.privateKey,
    csr: cert.csr,
  };

  const labelMap = {
    cert: "certificate.crt",
    key: "private.key",
    csr: "request.csr",
  };

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">类型</span>
          </div>
          <span className="text-sm font-semibold">自签名证书</span>
        </div>
        <div className="bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Key className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">密钥长度</span>
          </div>
          <span className="text-sm font-semibold">{cert.info.keySize} bit</span>
        </div>
        <div className="bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">有效期至</span>
          </div>
          <span className="text-sm font-semibold">
            {new Date(cert.info.validTo).toLocaleDateString("zh-CN")}
          </span>
        </div>
        <div className="bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-muted-foreground">序列号</span>
          </div>
          <span className="text-sm font-semibold font-mono text-xs truncate block">
            {cert.info.serialNumber}
          </span>
        </div>
      </div>

      {/* SANs */}
      {(cert.info.sans.length > 0 || cert.info.ipAddresses.length > 0) && (
        <div className="bg-card/50 border border-border/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold">Subject Alternative Names</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {cert.info.sans.map((dns) => (
              <Badge
                key={dns}
                variant="outline"
                className="bg-emerald-400/10 text-emerald-400 border-emerald-400/20"
              >
                <Globe className="w-3 h-3 mr-1" />
                {dns}
              </Badge>
            ))}
            {cert.info.ipAddresses.map((ip) => (
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
        </div>
      )}

      {/* Fingerprint */}
      <div className="bg-card/50 border border-border/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">SHA-256 指纹</span>
        </div>
        <code className="text-xs font-mono text-muted-foreground break-all">
          {cert.info.fingerprint}
        </code>
      </div>

      {/* PEM Content Tabs */}
      <div className="border border-border/50 rounded-lg overflow-hidden">
        <div className="flex items-center bg-secondary/50 border-b border-border/50">
          {(["cert", "key", "csr"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 text-sm font-mono transition-colors relative",
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
          <div className="ml-auto flex items-center gap-1 pr-2">
            <CopyButton text={contentMap[activeTab]} label="复制" />
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
        <div className="relative">
          <pre className="p-4 text-xs font-mono text-muted-foreground overflow-x-auto max-h-64 overflow-y-auto bg-black/20">
            {contentMap[activeTab]}
          </pre>
        </div>
      </div>

      {/* Download All */}
      <div className="flex gap-3">
        <Button
          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-black font-semibold"
          onClick={() => {
            downloadFile(cert.privateKey, `${cert.info.commonName}.key`);
            setTimeout(() => downloadFile(cert.certificate, `${cert.info.commonName}.crt`), 200);
            setTimeout(() => downloadFile(cert.csr, `${cert.info.commonName}.csr`), 400);
            toast.success("所有文件已开始下载");
          }}
        >
          <Download className="w-4 h-4 mr-2" />
          下载全部文件 (.key + .crt + .csr)
        </Button>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("domain");
  const [commonName, setCommonName] = useState("");
  const [organization, setOrganization] = useState("Local Development");
  const [country, setCountry] = useState("CN");
  const [state, setState] = useState("Beijing");
  const [locality, setLocality] = useState("Beijing");
  const [days, setDays] = useState("365");
  const [keySize, setKeySize] = useState("2048");
  const [sansInput, setSansInput] = useState("");
  const [ipInput, setIpInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCert, setGeneratedCert] = useState<GeneratedCert | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [includeCsr, setIncludeCsr] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  const parseList = (input: string): string[] =>
    input
      .split(/[,，\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const handleGenerate = useCallback(() => {
    if (!commonName.trim()) {
      toast.error("请填写通用名称 (Common Name)");
      return;
    }

    setIsGenerating(true);
    setGeneratedCert(null);

    // Simulate generation time for terminal animation
    setTimeout(() => {
      const options: CertOptions = {
        commonName: commonName.trim(),
        organization: organization.trim() || undefined,
        country: country.trim() || undefined,
        state: state.trim() || undefined,
        locality: locality.trim() || undefined,
        days: parseInt(days) || 365,
        keySize: parseInt(keySize) || 2048,
        sans: parseList(sansInput),
        ipAddresses: parseList(ipInput),
        algorithm: "RSA",
      };

      try {
        const cert = generateCertificate(options);
        setGeneratedCert(cert);
        toast.success("证书生成成功！");
      } catch (e) {
        toast.error("证书生成失败，请检查输入");
        console.error(e);
      } finally {
        setIsGenerating(false);
      }
    }, 2000);
  }, [commonName, organization, country, state, locality, days, keySize, sansInput, ipInput]);

  const quickPresets = [
    { label: "localhost", domains: "localhost", ips: "127.0.0.1" },
    { label: "开发服务器", domains: "dev.local, *.dev.local", ips: "192.168.1.100" },
    { label: "Docker 环境", domains: "docker.localhost", ips: "172.17.0.1, 172.18.0.1" },
    { label: "Kubernetes", domains: "kubernetes.default.svc, *.svc.cluster.local", ips: "10.96.0.1" },
  ];

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background bg-grid-pattern relative">
        {/* Ambient glow */}
        <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
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
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs border-emerald-500/20 text-emerald-400 bg-emerald-500/5">
                <Sparkles className="w-3 h-3 mr-1" />
                浏览器端生成
              </Badge>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          {/* Hero */}
          <div className="text-center mb-10 animate-slide-up">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              生成本地 <span className="text-emerald-400">SSL/TLS</span> 证书
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              为 IP 地址和本地域名快速生成自签名证书，无需命令行工具，
              所有操作在浏览器本地完成，数据不会上传到任何服务器。
            </p>
          </div>

          <div className="grid lg:grid-cols-5 gap-8">
            {/* Left Panel - Configuration */}
            <div className="lg:col-span-3 space-y-6">
              {/* Tab Selection */}
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
                        setCommonName(preset.domains.split(",")[0].trim());
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
                      {activeTab === "ip" ? "IP 地址" : "通用名称 (Common Name)"}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-3.5 h-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">
                          {activeTab === "ip"
                            ? "输入要生成证书的主要 IP 地址"
                            : "输入证书的主要域名，如 localhost 或 dev.local"}
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
                        <TooltipContent>
                          <p className="text-xs">用逗号分隔多个域名，支持通配符如 *.example.local</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <Textarea
                      id="sans"
                      placeholder="localhost, *.dev.local, app.example.local"
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
                        <TooltipContent>
                          <p className="text-xs">用逗号分隔多个 IPv4 地址</p>
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
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="days">有效期 (天)</Label>
                          <Input
                            id="days"
                            type="number"
                            value={days}
                            onChange={(e) => setDays(e.target.value)}
                            className="bg-background/50 font-mono"
                          />
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

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="csr">包含 CSR</Label>
                          <Tooltip>
                            <TooltipTrigger>
                              <Info className="w-3.5 h-3.5 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">同时生成证书签名请求文件</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                        <Switch
                          id="csr"
                          checked={includeCsr}
                          onCheckedChange={setIncludeCsr}
                        />
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
                {/* Empty State */}
                {!generatedCert && !isGenerating && (
                  <div className="bg-card/30 border border-border/30 rounded-xl p-8 text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/5 border border-emerald-500/10 flex items-center justify-center">
                      <Lock className="w-8 h-8 text-emerald-400/50" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">等待生成</h3>
                    <p className="text-sm text-muted-foreground">
                      配置左侧参数后点击"生成证书"<br />
                      证书将在此处显示
                    </p>

                    <Separator className="my-6" />

                    <div className="text-left space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-emerald-400 font-bold">1</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">选择模式</p>
                          <p className="text-xs text-muted-foreground">域名 / IP / 多名称</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-emerald-400 font-bold">2</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">填写信息</p>
                          <p className="text-xs text-muted-foreground">输入域名或IP地址</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-xs text-emerald-400 font-bold">3</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">生成 & 下载</p>
                          <p className="text-xs text-muted-foreground">一键下载所有证书文件</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Generating State */}
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

                {/* Generated Certificate */}
                {generatedCert && !isGenerating && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Check className="w-5 h-5 text-emerald-400" />
                      <h3 className="text-lg font-semibold">证书已生成</h3>
                    </div>
                    <CertPreview cert={generatedCert} />
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Usage Guide */}
          <section className="mt-16 mb-8">
            <h3 className="text-2xl font-bold mb-6 text-center">
              如何使用生成的证书
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: Terminal,
                  title: "Node.js / Express",
                  code: `const https = require('https');
const fs = require('fs');

https.createServer({
  key: fs.readFileSync('cert.key'),
  cert: fs.readFileSync('cert.crt')
}, app).listen(443);`,
                },
                {
                  icon: Globe,
                  title: "Nginx",
                  code: `server {
  listen 443 ssl;
  server_name localhost;

  ssl_certificate     cert.crt;
  ssl_certificate_key cert.key;
  
  # ...
}`,
                },
                {
                  icon: FileText,
                  title: "信任根证书",
                  code: `# macOS
sudo security add-trusted-cert \\
  -d -r trustRoot \\
  -k /Library/Keychains/System.keychain \\
  cert.crt

# Windows (双击安装)
certutil -addstore Root cert.crt`,
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
              <h4 className="text-sm font-semibold text-yellow-500 mb-1">安全提示</h4>
              <p className="text-sm text-muted-foreground">
                此工具生成的证书为<strong>自签名证书</strong>，仅适用于本地开发环境。
                生产环境请使用 Let's Encrypt 或商业 CA 签发的证书。
                所有生成过程在浏览器本地完成，私钥不会传输到任何服务器。
              </p>
            </div>
          </div>
        </main>

        {/* Footer */}
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
