package mongo

import (
	"testing"

	"github.com/oguaa/backend/internal/domain"
)

// F104: a partial save writes only what was sent.
func TestOrgProfileUpdate_writesOnlySentFields(t *testing.T) {
	t.Parallel()
	summary := "Fixed a typo."
	set, unset := orgProfileUpdate(domain.OrgProfilePatch{Summary: &summary})
	if len(set) != 1 || set["summary"] != summary {
		t.Fatalf("$set = %v, want only summary", set)
	}
	if len(unset) != 0 {
		t.Fatalf("$unset = %v, want none", unset)
	}
}

func TestOrgProfileUpdate_emptiesAndClears(t *testing.T) {
	t.Parallel()
	empty := ""
	var noLinks []domain.SocialLink
	lat := 5.105
	set, unset := orgProfileUpdate(domain.OrgProfilePatch{
		MoMoNumber: &empty, VerificationArtifacts: &noLinks,
		Latitude: &lat, ClearLongitude: true, ClearNHISAccredited: true,
	})
	if set["momoNumber"] != "" {
		t.Errorf("momoNumber should be set to empty, got %v", set["momoNumber"])
	}
	if links, ok := set["verificationArtifacts"].([]domain.SocialLink); !ok || links == nil || len(links) != 0 {
		t.Errorf("verificationArtifacts should be an empty list, got %#v", set["verificationArtifacts"])
	}
	if set["latitude"] != lat {
		t.Errorf("latitude = %v, want %v", set["latitude"], lat)
	}
	if _, ok := unset["longitude"]; !ok {
		t.Error("longitude should be unset")
	}
	if _, ok := unset["nhisAccredited"]; !ok {
		t.Error("nhisAccredited should be unset")
	}
	if _, ok := set["summary"]; ok {
		t.Error("summary was not sent and must not be written")
	}
}
