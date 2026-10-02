package service

import (
	"context"
	"errors"
	"net/mail"
	"regexp"
	"slices"
	"strings"

	"github.com/oguaa/backend/internal/domain"
)

// ── ad sponsors (spec §3.3, §3.7 step 2, §4.3, §4.6) ────────────────────────
//
// A sponsor is who pays for and is named on an ad. Commercial sponsors give a
// display name and contact details; political sponsors are verified people or
// organisations: legal name, Ghana Card or registration, the party, candidate,
// office and constituency, and a citizenship declaration (Act 574 s.24). Staff
// verify a sponsor before any of its ads can be approved.

const (
	minSponsorDisplayRunes = 2
	maxSponsorDisplayRunes = 60
	minSponsorLegalRunes   = 2
	maxSponsorLegalRunes   = 120
	maxSponsorFieldRunes   = 120
	maxSponsorAddressRunes = 300
	maxSponsorsPerMember   = 20

	adFieldIDDocument      = "idDocumentUploadId"
	sfCandidate            = "candidateName"
	sfConstituency         = "constituency"
	sfIDLast4              = "idNumberLast4"
	sfKind                 = "kind"
	sfParty                = "partyName"
	sfRegistration         = "registrationNumber"
	sfPhone                = "phone"
	sfEmail                = "email"
	adFieldECAuthorisation = "ecAuthorisationUploadId"
)

var (
	sponsorPhoneRe = regexp.MustCompile(`^\+?[0-9][0-9 ()-]{6,19}$`)
	last4Re        = regexp.MustCompile(`^[0-9A-Za-z]{4}$`)
)

// adEntityTypes are the sponsor entity types.
var adEntityTypes = []string{
	domain.AdEntityIndividual, domain.AdEntityBusiness, domain.AdEntityNGO, domain.AdEntityGovernment,
	domain.AdEntityParty, domain.AdEntityCandidate, domain.AdEntityCampaignCommittee,
}

// adOffices are the political offices.
var adOffices = []string{
	domain.AdOfficePresidential, domain.AdOfficeParliamentary, domain.AdOfficeDistrictAssembly,
	domain.AdOfficePartyInternal, domain.AdOfficeIssue,
}

// personEntity reports whether an entity is a natural person (identified by
// Ghana Card) rather than an organisation (identified by registration).
func personEntity(t string) bool {
	return t == domain.AdEntityIndividual || t == domain.AdEntityCandidate
}

// AdSponsorInput is the POST/PUT /api/me/ad-sponsors body.
type AdSponsorInput struct {
	Kind                    string `json:"kind"`
	EntityType              string `json:"entityType"`
	DisplayName             string `json:"displayName"`
	LegalName               string `json:"legalName"`
	RegistrationNumber      string `json:"registrationNumber"`
	IDNumberLast4           string `json:"idNumberLast4"`
	IDDocumentUploadID      string `json:"idDocumentUploadId"`
	TIN                     string `json:"tin"`
	Address                 string `json:"address"`
	Phone                   string `json:"phone"`
	Email                   string `json:"email"`
	ContactPerson           string `json:"contactPerson"`
	PartyName               string `json:"partyName"`
	CandidateName           string `json:"candidateName"`
	Office                  string `json:"office"`
	Constituency            string `json:"constituency"`
	ECAuthorisationUploadID string `json:"ecAuthorisationUploadId"`
	CitizenshipDeclaration  bool   `json:"citizenshipDeclaration"`
}

func errSponsor(field, message string) *AdError {
	return adFieldErr(AdErrInvalidSponsor, field, message)
}

// buildSponsor validates in and returns the sponsor fields it sets.
func buildSponsor(in AdSponsorInput) (domain.AdSponsor, error) {
	t := func(s string) string { return strings.Join(strings.Fields(s), " ") }
	sp := domain.AdSponsor{
		Kind: t(in.Kind), EntityType: t(in.EntityType), DisplayName: t(in.DisplayName), LegalName: t(in.LegalName),
		RegistrationNumber: t(in.RegistrationNumber), IDNumberLast4: t(in.IDNumberLast4), IDDocumentUploadID: privateUploadID(in.IDDocumentUploadID),
		TIN: t(in.TIN), Address: t(in.Address), Phone: t(in.Phone), Email: strings.TrimSpace(in.Email), ContactPerson: t(in.ContactPerson),
	}
	if err := checkSponsorBasics(sp); err != nil {
		return sp, err
	}
	if err := checkSponsorContact(sp); err != nil {
		return sp, err
	}
	if err := checkSponsorNames(sp.DisplayName, sp.LegalName); err != nil {
		return sp, err
	}
	if sp.Kind == domain.AdSponsorPolitical {
		if err := fillPoliticalSponsor(&sp, in, t); err != nil {
			return sp, err
		}
	}
	return sp, nil
}

// checkSponsorBasics checks kind, entity type and names.
func checkSponsorBasics(sp domain.AdSponsor) error {
	switch {
	case sp.Kind != domain.AdSponsorCommercial && sp.Kind != domain.AdSponsorPolitical:
		return errSponsor(sfKind, "Choose commercial or political.")
	case !slices.Contains(adEntityTypes, sp.EntityType):
		return errSponsor("entityType", "Choose what kind of sponsor this is.")
	case runeLen(sp.DisplayName) < minSponsorDisplayRunes || runeLen(sp.DisplayName) > maxSponsorDisplayRunes:
		return errSponsor("displayName", "Give the name shown on ads (2 to 60 characters).")
	case runeLen(sp.LegalName) < minSponsorLegalRunes || runeLen(sp.LegalName) > maxSponsorLegalRunes:
		return errSponsor("legalName", "Give the full legal name (2 to 120 characters).")
	}
	for field, v := range map[string]string{sfRegistration: sp.RegistrationNumber, "tin": sp.TIN, "contactPerson": sp.ContactPerson} {
		if runeLen(v) > maxSponsorFieldRunes {
			return errSponsor(field, "Keep this under 120 characters.")
		}
	}
	if sp.IDNumberLast4 != "" && !last4Re.MatchString(sp.IDNumberLast4) {
		return errSponsor(sfIDLast4, "Give only the last 4 characters of the Ghana Card number.")
	}
	return nil
}

// checkSponsorContact checks address, phone and email.
func checkSponsorContact(sp domain.AdSponsor) error {
	if n := runeLen(sp.Address); n < 5 || n > maxSponsorAddressRunes {
		return errSponsor("address", "Give a physical or Ghana Post GPS address.")
	}
	if !sponsorPhoneRe.MatchString(sp.Phone) {
		return errSponsor(sfPhone, "Give a phone number we can reach.")
	}
	if a, err := mail.ParseAddress(sp.Email); err != nil || a.Address != sp.Email {
		return errSponsor(sfEmail, "Give a valid email address.")
	}
	return nil
}

// fillPoliticalSponsor applies the political sponsor rules: identity,
// citizenship, office and (for District Assembly) the EC authorisation.
func fillPoliticalSponsor(sp *domain.AdSponsor, in AdSponsorInput, t func(string) string) error {
	if !in.CitizenshipDeclaration {
		return adFieldErr(AdErrCitizenshipRequired, "citizenshipDeclaration", "Political sponsors must declare Ghanaian citizenship or ownership.")
	}
	sp.PartyName, sp.CandidateName, sp.Office, sp.Constituency = t(in.PartyName), t(in.CandidateName), t(in.Office), t(in.Constituency)
	sp.ECAuthorisationUploadID = privateUploadID(in.ECAuthorisationUploadID)
	if personEntity(sp.EntityType) {
		if sp.IDNumberLast4 == "" {
			return errSponsor(sfIDLast4, "Give the last 4 characters of the Ghana Card number.")
		}
		if sp.IDDocumentUploadID == "" {
			return errSponsor(adFieldIDDocument, "Upload a copy of the Ghana Card.")
		}
	} else if sp.RegistrationNumber == "" {
		return errSponsor(sfRegistration, "Give the organisation's registration number.")
	}
	return checkPoliticalOffice(*sp)
}

// checkPoliticalOffice requires the office and the names it implies.
func checkPoliticalOffice(sp domain.AdSponsor) error {
	if !slices.Contains(adOffices, sp.Office) {
		return errSponsor("office", "Choose the office or say this is an issue campaign.")
	}
	for field, v := range map[string]string{sfParty: sp.PartyName, sfCandidate: sp.CandidateName, sfConstituency: sp.Constituency} {
		if runeLen(v) > maxSponsorFieldRunes {
			return errSponsor(field, "Keep this under 120 characters.")
		}
	}
	needsCandidate := sp.Office == domain.AdOfficePresidential || sp.Office == domain.AdOfficeParliamentary || sp.Office == domain.AdOfficeDistrictAssembly
	switch {
	case needsCandidate && sp.CandidateName == "":
		return errSponsor(sfCandidate, "Name the candidate.")
	case (sp.Office == domain.AdOfficeParliamentary || sp.Office == domain.AdOfficeDistrictAssembly) && sp.Constituency == "":
		return errSponsor(sfConstituency, "Name the constituency or electoral area.")
	case (sp.EntityType == domain.AdEntityParty || sp.Office == domain.AdOfficePartyInternal) && sp.PartyName == "":
		return errSponsor(sfParty, "Name the party.")
	case sp.Office == domain.AdOfficeDistrictAssembly && sp.ECAuthorisationUploadID == "":
		return errSponsor(adFieldECAuthorisation, "Upload the Electoral Commission's authorisation.")
	}
	return nil
}

// MySponsors lists the member's sponsors with their contact details.
func (s *AdsService) MySponsors(ctx context.Context, memberID string) ([]domain.AdSponsorOwnerView, error) {
	rows, err := s.sponsors.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	out := make([]domain.AdSponsorOwnerView, 0, len(rows))
	for _, sp := range rows {
		out = append(out, sp.OwnerView())
	}
	return out, nil
}

// CreateSponsor records a new sponsor for the member (status pending).
func (s *AdsService) CreateSponsor(ctx context.Context, memberID string, in AdSponsorInput) (*domain.AdSponsorOwnerView, error) {
	sp, err := buildSponsor(in)
	if err != nil {
		return nil, err
	}
	if err := s.checkSponsorUploads(ctx, memberID, sp); err != nil {
		return nil, err
	}
	existing, err := s.sponsors.ByMember(ctx, memberID)
	if err != nil {
		return nil, err
	}
	if len(existing) >= maxSponsorsPerMember {
		return nil, errSponsor(sfKind, "You have reached the limit of 20 sponsors. Edit one of them instead.")
	}
	now := s.nowRFC()
	sp.ID, sp.MemberID, sp.Status, sp.CreatedAt, sp.UpdatedAt = newID(prefixAdSponsor), memberID, domain.AdSponsorPending, now, now
	if sp.Kind == domain.AdSponsorPolitical {
		sp.CitizenshipDeclaredAt = now
	}
	if err := s.sponsors.Insert(ctx, sp); err != nil {
		return nil, err
	}
	v := sp.OwnerView()
	return &v, nil
}

// UpdateSponsor lets the owner correct a sponsor while it is pending or
// rejected; it goes back to pending for review. Verified and suspended
// sponsors are locked.
func (s *AdsService) UpdateSponsor(ctx context.Context, memberID, id string, in AdSponsorInput) (*domain.AdSponsorOwnerView, error) {
	prev, err := s.sponsors.Get(ctx, id)
	if err != nil || prev == nil || memberID == "" || prev.MemberID != memberID {
		return nil, adErr(AdErrSponsorNotFound, "We couldn't find that sponsor.")
	}
	editable := []string{domain.AdSponsorPending, domain.AdSponsorRejected}
	if !slices.Contains(editable, prev.Status) {
		return nil, adErr(AdErrSponsorLocked, "A verified sponsor can't be edited. Contact us to change its details.")
	}
	// The owner never sees the stored upload ids, so an empty id keeps the
	// document already on file.
	if strings.TrimSpace(in.IDDocumentUploadID) == "" {
		in.IDDocumentUploadID = prev.IDDocumentUploadID
	}
	if strings.TrimSpace(in.ECAuthorisationUploadID) == "" {
		in.ECAuthorisationUploadID = prev.ECAuthorisationUploadID
	}
	sp, err := buildSponsor(in)
	if err != nil {
		return nil, err
	}
	if err := s.checkSponsorUploads(ctx, memberID, sp); err != nil {
		return nil, err
	}
	now := s.nowRFC()
	sp.ID, sp.MemberID, sp.Status, sp.CreatedAt, sp.UpdatedAt = prev.ID, prev.MemberID, domain.AdSponsorPending, prev.CreatedAt, now
	if sp.Kind == domain.AdSponsorPolitical {
		sp.CitizenshipDeclaredAt = now
	}
	ok, err := s.sponsors.Update(ctx, sp, editable)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, adErr(AdErrSponsorLocked, "This sponsor was reviewed while you were editing. Reload to see its status.")
	}
	v := sp.OwnerView()
	return &v, nil
}

// checkSponsorUploads confirms the sponsor's documents are the member's own.
func (s *AdsService) checkSponsorUploads(ctx context.Context, memberID string, sp domain.AdSponsor) error {
	return s.checkOwnUploads(ctx, memberID, map[string]string{
		adFieldIDDocument: sp.IDDocumentUploadID, adFieldECAuthorisation: sp.ECAuthorisationUploadID,
	})
}

// ── staff ───────────────────────────────────────────────────────────────────

// Ad documents a reviewer opens (spec §4.6). Their links go through the ads
// routes, not the general private-upload read, so moderators (who review
// commercial ads) can open these documents and nothing else; every read is
// audited by the private-upload service.
const (
	AdDocApproval        = "approval"
	AdDocIDDocument      = "id"
	AdDocECAuthorisation = "ec"

	adminAdsPath        = "/api/admin/ads/"
	adminAdSponsorsPath = "/api/admin/ad-sponsors/"
	adDocumentsSegment  = "/documents/"
)

// AdSponsorAdmin is a sponsor as staff see it: contact details, the member
// it belongs to, and links to its private documents.
type AdSponsorAdmin struct {
	domain.AdSponsor
	MemberID           string `json:"memberId,omitempty"`
	Phone              string `json:"phone"`
	Email              string `json:"email"`
	HasIDDocument      bool   `json:"hasIdDocument"`
	IDDocumentURL      string `json:"idDocumentUrl,omitempty"`
	ECAuthorisationURL string `json:"ecAuthorisationUrl,omitempty"`
}

func sponsorAdminView(sp domain.AdSponsor) AdSponsorAdmin {
	v := AdSponsorAdmin{AdSponsor: sp, MemberID: sp.MemberID, Phone: sp.Phone, Email: sp.Email, HasIDDocument: sp.IDDocumentUploadID != ""}
	if sp.IDDocumentUploadID != "" {
		v.IDDocumentURL = adminAdSponsorsPath + sp.ID + adDocumentsSegment + AdDocIDDocument
	}
	if sp.ECAuthorisationUploadID != "" {
		v.ECAuthorisationURL = adminAdSponsorsPath + sp.ID + adDocumentsSegment + AdDocECAuthorisation
	}
	return v
}

// SponsorDocument returns the private upload behind a sponsor's ID document
// (kind "id") or Electoral Commission authorisation (kind "ec").
func (s *AdsService) SponsorDocument(ctx context.Context, id, kind string) (string, error) {
	sp, err := s.sponsors.Get(ctx, id)
	if err != nil || sp == nil {
		return "", adErr(AdErrSponsorNotFound, "We couldn't find that sponsor.")
	}
	upload := ""
	switch kind {
	case AdDocIDDocument:
		upload = sp.IDDocumentUploadID
	case AdDocECAuthorisation:
		upload = sp.ECAuthorisationUploadID
	}
	if upload == "" {
		return "", errAdNotFound()
	}
	return upload, nil
}

// CampaignDocument returns the private upload behind a campaign's regulator
// approval letter.
func (s *AdsService) CampaignDocument(ctx context.Context, id string) (string, error) {
	c, err := s.getCampaign(ctx, id)
	if err != nil {
		return "", err
	}
	if c.Compliance.ApprovalUploadID == "" {
		return "", errAdNotFound()
	}
	return c.Compliance.ApprovalUploadID, nil
}

// AdminSponsors lists sponsors for review (status/kind narrow it).
func (s *AdsService) AdminSponsors(ctx context.Context, f domain.AdSponsorFilter) ([]AdSponsorAdmin, error) {
	rows, err := s.sponsors.List(ctx, f)
	if err != nil {
		return nil, err
	}
	out := make([]AdSponsorAdmin, 0, len(rows))
	for _, sp := range rows {
		out = append(out, sponsorAdminView(sp))
	}
	return out, nil
}

// Sponsor review actions.
const (
	SponsorActionVerify  = "verify"
	SponsorActionReject  = "reject"
	SponsorActionSuspend = "suspend"
)

// ReviewSponsor verifies, rejects or suspends a sponsor. A rejection or
// suspension needs a note; suspending also pauses the sponsor's running
// campaigns.
func (s *AdsService) ReviewSponsor(ctx context.Context, id, action, note string, by AuditActor) (*AdSponsorAdmin, error) {
	note = strings.TrimSpace(note)
	if runeLen(note) > maxAdNoteRunes {
		return nil, adFieldErr(AdErrInvalidReason, "note", "Keep the note under 1,000 characters.")
	}
	var from []string
	var to string
	switch action {
	case SponsorActionVerify:
		from, to = []string{domain.AdSponsorPending, domain.AdSponsorRejected, domain.AdSponsorSuspended}, domain.AdSponsorVerified
	case SponsorActionReject:
		from, to = []string{domain.AdSponsorPending, domain.AdSponsorVerified}, domain.AdSponsorRejected
	case SponsorActionSuspend:
		from, to = []string{domain.AdSponsorPending, domain.AdSponsorVerified}, domain.AdSponsorSuspended
	default:
		return nil, adErr(AdErrInvalidTransition, "Choose verify, reject or suspend.")
	}
	if to != domain.AdSponsorVerified && runeLen(note) < minAdReasonRunes {
		return nil, adFieldErr(AdErrInvalidReason, "note", "Say why (at least 5 characters). The sponsor sees this note.")
	}
	if prev, err := s.sponsors.Get(ctx, id); err == nil && prev != nil && prev.MemberID != "" && prev.MemberID == by.ID {
		return nil, adErr(AdErrForbidden, "You can't review a sponsor you created. Ask another curator.")
	}
	ok, err := s.sponsors.SetStatus(ctx, id, from, to, note, by.Name, s.nowRFC())
	if err != nil {
		return nil, err
	}
	sp, gerr := s.sponsors.Get(ctx, id)
	var nf *domain.NotFoundError
	if errors.As(gerr, &nf) || (gerr == nil && sp == nil) {
		return nil, adErr(AdErrSponsorNotFound, "We couldn't find that sponsor.")
	}
	if gerr != nil {
		return nil, gerr
	}
	if !ok {
		return nil, adErr(AdErrInvalidTransition, "This sponsor can't make that change in its current state.")
	}
	if to == domain.AdSponsorSuspended {
		if _, err := s.pauseMatching(ctx, domain.AdFilter{SponsorID: id}, by.Name, "Sponsor suspended: "+note, domain.AdPausedBySponsor); err != nil {
			return nil, err
		}
	}
	v := sponsorAdminView(*sp)
	return &v, nil
}
