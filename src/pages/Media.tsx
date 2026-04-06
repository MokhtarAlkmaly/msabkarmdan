import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Upload, Trash2, Image, Video, X } from "lucide-react";
import { Link } from "react-router-dom";
import { START_YEAR, END_YEAR } from "@/types/student";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const HIJRI_MONTHS = [
  "محرم", "صفر", "ربيع الأول", "ربيع الآخر",
  "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان",
  "رمضان", "شوال", "ذو القعدة", "ذو الحجة"
];

interface MediaItem {
  id: string;
  year: string;
  month: number;
  title: string;
  file_path: string;
  file_type: "image" | "video";
  file_size: number;
  created_at: string;
}

const Media = () => {
  const [selectedYear, setSelectedYear] = useState("1447");
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const loadMedia = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("media")
      .select("*")
      .eq("user_id", user.id)
      .eq("year", selectedYear)
      .order("month")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
    } else {
      setMediaItems((data as MediaItem[]) || []);
    }
    setLoading(false);
  }, [user, selectedYear]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const getPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from("media").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !user) return;
    setUploading(true);

    const files = Array.from(e.target.files);
    
    for (const file of files) {
      const isImage = file.type.startsWith("image/");
      const isVideo = file.type.startsWith("video/");
      if (!isImage && !isVideo) {
        toast({ title: "نوع ملف غير مدعوم", description: file.name, variant: "destructive" });
        continue;
      }

      // Get current Hijri month
      const hijriDate = new Date().toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { month: "numeric" });
      const currentMonth = parseInt(hijriDate) || 1;

      const ext = file.name.split(".").pop();
      const filePath = `${user.id}/${selectedYear}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("media").upload(filePath, file);
      if (uploadError) {
        console.error(uploadError);
        toast({ title: "خطأ في الرفع", description: uploadError.message, variant: "destructive" });
        continue;
      }

      const { error: insertError } = await supabase.from("media").insert({
        user_id: user.id,
        year: selectedYear,
        month: currentMonth,
        title: file.name,
        file_path: filePath,
        file_type: isImage ? "image" : "video",
        file_size: file.size,
      });

      if (insertError) {
        console.error(insertError);
      }
    }

    setUploading(false);
    await loadMedia();
    toast({ title: "تم الرفع", description: `تم رفع ${files.length} ملف بنجاح` });
    e.target.value = "";
  };

  const handleDelete = async (item: MediaItem) => {
    if (!confirm("هل أنت متأكد من حذف هذا الملف؟")) return;

    await supabase.storage.from("media").remove([item.file_path]);
    await supabase.from("media").delete().eq("id", item.id);
    await loadMedia();
    toast({ title: "تم الحذف", variant: "destructive" });
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Group by month
  const groupedByMonth: Record<number, MediaItem[]> = {};
  mediaItems.forEach((item) => {
    if (!groupedByMonth[item.month]) groupedByMonth[item.month] = [];
    groupedByMonth[item.month].push(item);
  });

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="bg-primary text-primary-foreground py-4 px-4">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold">📸 الصور والفيديوهات</h1>
          <Link to="/">
            <Button variant="ghost" size="sm" className="text-primary-foreground gap-1">
              <ArrowRight className="h-4 w-4" />
              العودة للرئيسية
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Controls */}
        <div className="bg-card rounded-lg border border-border p-4 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">السنة:</span>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: END_YEAR - START_YEAR + 1 }, (_, i) => START_YEAR + i).map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}هـ
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="cursor-pointer">
            <Button asChild disabled={uploading} className="gap-2">
              <span>
                <Upload className="h-4 w-4" />
                {uploading ? "جارٍ الرفع..." : "رفع صور / فيديوهات"}
              </span>
            </Button>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleUpload}
              className="hidden"
            />
          </label>

          <span className="mr-auto text-sm text-muted-foreground">
            الملفات: <span className="font-bold text-foreground">{mediaItems.length}</span>
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">جارٍ التحميل...</div>
        ) : mediaItems.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Image className="h-16 w-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">لا توجد صور أو فيديوهات لعام {selectedYear}هـ</p>
            <p className="text-sm mt-1">اضغط على "رفع صور / فيديوهات" لإضافة ملفات</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedByMonth)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([month, items]) => (
                <div key={month}>
                  <h2 className="text-lg font-bold mb-3 text-primary border-b border-border pb-2">
                    📅 {HIJRI_MONTHS[parseInt(month) - 1]} - {selectedYear}هـ
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="group relative bg-card border border-border rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                      >
                        <div
                          className="aspect-square cursor-pointer"
                          onClick={() => setPreviewItem(item)}
                        >
                          {item.file_type === "image" ? (
                            <img
                              src={getPublicUrl(item.file_path)}
                              alt={item.title}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Video className="h-12 w-12 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs truncate text-muted-foreground">{item.title}</p>
                          <p className="text-xs text-muted-foreground/60">{formatSize(item.file_size)}</p>
                        </div>
                        <button
                          onClick={() => handleDelete(item)}
                          className="absolute top-1 left-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewItem} onOpenChange={() => setPreviewItem(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <button
            onClick={() => setPreviewItem(null)}
            className="absolute top-2 left-2 z-10 bg-background/80 rounded-full p-1"
          >
            <X className="h-5 w-5" />
          </button>
          {previewItem && (
            previewItem.file_type === "image" ? (
              <img
                src={getPublicUrl(previewItem.file_path)}
                alt={previewItem.title}
                className="w-full h-auto max-h-[85vh] object-contain"
              />
            ) : (
              <video
                src={getPublicUrl(previewItem.file_path)}
                controls
                className="w-full max-h-[85vh]"
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Media;
