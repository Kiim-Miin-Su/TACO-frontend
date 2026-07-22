import Image from "next/image";
import { ACADEMY_BRAND } from "@/lib/brand";

type BrandMarkProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

/** 공식 TN Academy 정체성을 favicon과 화면에서 공유하는 장식용 마크. */
export default function BrandMark({ size = 32, className, priority = false }: BrandMarkProps) {
  return (
    <Image
      src={ACADEMY_BRAND.markPath}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
