import { Link } from "react-router-dom";
import type { SellerIdentity } from "@/lib/types";
import { LEGAL } from "@/lib/legal";
import { formatDate } from "@/lib/format";

/**
 * Who the buyer contracts with (G111 / K19). Shows the seller's verified legal
 * identity from KYC and states Oguaa's role as the marketplace platform, with
 * the Terms of Sale linked (G112).
 */
export function SellerDetails({ seller, shopName, className = "" }: Readonly<{ seller?: SellerIdentity; shopName: string; className?: string }>) {
  const name = seller?.legalName || shopName;
  return (
    <div className={`rounded-xl border border-sand bg-paper p-4 text-xs leading-relaxed text-ink-muted ${className}`}>
      {seller ? (
        <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold text-ink">Seller</dt>
          <dd>{seller.legalName}{seller.verifiedAt && <span className="text-ink-faint"> · verified {formatDate(seller.verifiedAt)}</span>}</dd>
          {seller.registrationNumber && (<><dt className="font-semibold text-ink">Registration no.</dt><dd>{seller.registrationNumber}</dd></>)}
          {seller.location && (<><dt className="font-semibold text-ink">GhanaPost GPS</dt><dd>{seller.location}</dd></>)}
          {seller.contactEmail && (<><dt className="font-semibold text-ink">Email</dt><dd className="break-all">{seller.contactEmail}</dd></>)}
          {seller.contactPhone && (<><dt className="font-semibold text-ink">Phone</dt><dd>{seller.contactPhone}</dd></>)}
        </dl>
      ) : (
        <p>This shop hasn&rsquo;t completed Oguaa&rsquo;s seller verification yet.</p>
      )}
      <p className="mt-2">
        Oguaa is the marketplace platform; the seller, {name}, is responsible for the goods and your contract is with them.{" "}
        <Link to={LEGAL.termsOfSale} className="font-semibold text-green-text underline">Terms of Sale</Link> (refunds, returns and disputes).
      </p>
    </div>
  );
}
