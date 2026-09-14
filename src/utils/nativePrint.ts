// طباعة ومشاركة تعمل على الويب وعلى التطبيق الأصلي (Capacitor)

const isNative = (): boolean => {
  const cap = (window as any)?.Capacitor;
  return Boolean(cap?.isNativePlatform?.());
};

export const printHtmlDocument = async (html: string, title = "تقرير") => {
  if (isNative()) {
    try {
      const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
      const { Share } = await import("@capacitor/share");
      const fileName = `${title.replace(/[^\p{L}\p{N}_-]+/gu, "_")}.html`;
      await Filesystem.writeFile({
        path: fileName,
        data: html,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Cache });
      await Share.share({ title, url: uri, dialogTitle: title });
      return;
    } catch (error) {
      console.warn("تعذر المشاركة على التطبيق، سيتم استخدام الطباعة العادية", error);
    }
  }

  const win = window.open("", "_blank");
  if (!win) {
    alert("يرجى السماح بالنوافذ المنبثقة للطباعة");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch (error) {
      console.error("تعذرت الطباعة", error);
    }
  }, 400);
};

export const shareText = async (text: string, title = "مشاركة") => {
  if (isNative()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, dialogTitle: title });
      return;
    } catch (error) {
      console.warn("تعذرت المشاركة على التطبيق", error);
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch {
      // تم الإلغاء
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    alert("تم نسخ النص");
  } catch {
    alert(text);
  }
};
