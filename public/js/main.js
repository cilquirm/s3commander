// Setup Form
function setupConnectForm() {
  $("form").submit(function(){
    // Hide connect form and show s3 browser
    $('.connect-form').hide();
    $('.s3-browser').show();

    // Setup s3 commander
    $("#s3commander").s3commander({
      sAccessKey: $("#txtAccessKey").val(),
      sSecretKey: $("#txtSecretKey").val(),
      sBucket: $("#txtBucket").val(),
      sPrefix: $("#txtPrefix").val(),
      sEndpoint: $("#txtEndpoint").val(),
      bShowVersions: $("#chkVersions").is(":checked"),
      bConfirmDelete: $("#chkConfirm").is(":checked"),
      iMaxFilesizeMB: 10240
    });

    return false;
  });

  $('#disconnect').on('click', function(){
    location.reload();
  });
}

// Initialize Connect Form
function init() {
  $('#main-body').load('views/_connect.html', setupConnectForm);
}

$(document).ready(function(){
  init();
});